"""HTTP service for the in-app assistant (spike).

    cd backend
    ASSISTANT_PORT=5077 ANTHROPIC_API_KEY=... uv run --no-project --python 3.12 \
        --with-requirements assistant/requirements.txt python -m assistant.server

Runs on its own port, separate from the API workers: a chat turn streams for
10-60 s, which would tie up the API's few gunicorn threads.

Every request carries the user's own Karma JWT (the web app's Authorization
header). The service validates it with /auth/me on the Karma API and makes every
tool call with that token — the API's tenant scoping, feature caps and ACLs apply
unchanged.

Each user has ONE conversation per company, stored (store.py) until they clear
it: it survives page changes, closed tabs, logouts and service restarts.

Endpoints
  GET    /assistant/health
  GET    /assistant/conversation                 -> {model, busy, items}
  POST   /assistant/conversation/messages {text} -> text/event-stream
           events: status · text · chart · confirm · confirm_resolved · done · error
  POST   /assistant/conversation/confirm {confirm_id, approved, confirm_text}
           money/stock/delete actions need confirm_text == "CONFIRM" (checked here)
  DELETE /assistant/conversation                 -> clears the history
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlparse

import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

from .agent import Conversation
from .karma_client import KarmaClient, KarmaError
from .providers.base import Callbacks
from .policy import Policy
from .registry import resolve
from .store import Store, Stored, Transcript, account_of, for_user, owner_key

KARMA_API = os.environ.get("KARMA_API", "http://localhost:5000")
CORS_ORIGINS = os.environ.get("ASSISTANT_CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")
CONFIRM_TIMEOUT_S = 600
IDLE_EXPIRY_S = 2 * 3600       # live objects only; the stored history stays
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

STORE: Store | None = None
POLICY: Policy | None = None


def store() -> Store:
    global STORE
    if STORE is None:
        STORE = Store()
    return STORE


def policy() -> Policy:
    global POLICY
    if POLICY is None or POLICY.store is not store():
        POLICY = Policy(store())
    return POLICY


@dataclass
class Pending:
    request: object
    event: threading.Event = field(default_factory=threading.Event)
    approved: bool = False


@dataclass
class Live:
    """The in-memory side of a user's conversation (rebuilt from the store on demand)."""
    key: str
    me: dict
    convo: Conversation | None = None
    stored: Stored | None = None
    busy: threading.Lock = field(default_factory=threading.Lock)
    pending: dict[str, Pending] = field(default_factory=dict)
    last_used: float = field(default_factory=time.monotonic)
    emit: object = None


LIVE: dict[str, Live] = {}
LIVE_LOCK = threading.Lock()


# --------------------------------------------------------------------------- helpers

def _token(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    return auth[7:].strip() if auth.lower().startswith("bearer ") else None


def _who(token: str) -> tuple[KarmaClient, dict]:
    client = KarmaClient(KARMA_API, token=token)
    return client, client.me()   # raises KarmaError(401) for a bad/expired token


def _err(status: int, msg: str) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=status)


def _purge():
    now = time.monotonic()
    with LIVE_LOCK:
        for k in [k for k, s in LIVE.items() if now - s.last_used > IDLE_EXPIRY_S and not s.busy.locked()]:
            LIVE.pop(k, None)


async def _caller(request: Request) -> tuple[Live, KarmaClient] | JSONResponse:
    token = _token(request)
    if not token:
        return _err(401, "Sign in first.")
    try:
        client, me = await asyncio.to_thread(_who, token)
    except KarmaError as e:
        return _err(401 if e.status in (401, 422) else 502, "Your session has expired. Sign in again.")
    key = owner_key(me)
    with LIVE_LOCK:
        live = LIVE.get(key)
        if live is None:
            live = LIVE[key] = Live(key=key, me=me)
    live.me = me
    live.last_used = time.monotonic()
    return live, client


def _model_info(model_id: str | None) -> dict:
    spec = resolve(model_id)
    return {"id": spec.id, "label": spec.label}


def _ensure_conversation(live: Live, client: KarmaClient) -> Conversation:
    """Build (or rebuild from the store) the user's Conversation. Runs in a worker thread."""
    if live.convo is not None:
        live.convo.client.token = client.token
        return live.convo
    stored = live.stored or store().get(live.key)
    # a conversation stays on the model it started with; new ones get the
    # model the platform owner selected
    spec = resolve(stored.model_id) if stored else policy().model()
    if not spec.configured:
        raise RuntimeError(f"The assistant's model ({spec.label}) is not configured on the server.")

    def confirm(req) -> bool:
        cid = uuid.uuid4().hex[:12]
        p = Pending(request=req)
        live.pending[cid] = p
        if live.emit:
            live.emit({"type": "confirm", "confirm_id": cid, "tier": req.tier, "title": req.title,
                       "target": req.target, "lines": req.lines, "method": req.method, "path": req.path})
        p.event.wait(CONFIRM_TIMEOUT_S)
        live.pending.pop(cid, None)
        if live.emit:
            live.emit({"type": "confirm_resolved", "confirm_id": cid, "approved": p.approved})
        return p.approved

    kwargs = dict(client=client, spec=spec, allow_writes=True, confirm=confirm)
    if stored:
        kwargs.update(id=stored.conv_id, messages=list(stored.messages))
    convo = Conversation(**kwargs)
    # audit log: every proposed write, the user's decision and the API's answer
    convo.executor.on_action = lambda record: store().record_action(me=live.me, conv_id=convo.id, record=record)
    if stored is None:
        me = live.me
        stored = Stored(owner_key=live.key, user_uuid=me["uuid"],
                        account_uuid=me.get("impersonating_account_uuid") or me.get("account_uuid"),
                        conv_id=convo.id, model_id=spec.id)
    live.stored, live.convo = stored, convo
    return convo


def _record_usage(live: Live, convo: Conversation, outcome: str, voice: bool, r) -> None:
    """One row per question: the budget and the rate limit are counted from these."""
    try:
        store().record_usage(
            me=live.me, conv_id=convo.id, model_id=convo.spec.id, outcome=outcome, voice=voice,
            cost_usd=r.cost_usd if r else 0.0, usage=r.usage if r else None, seconds=r.seconds if r else 0.0,
            model_calls=r.model_calls if r else 0, tool_calls=len(r.tool_calls) if r else 0)
    except Exception as e:  # never lose the answer over bookkeeping
        print(f"[assistant] usage not recorded: {e}", flush=True)


def _deny_pending(live: Live):
    for p in list(live.pending.values()):
        p.approved = False
        p.event.set()


def _access_json(access) -> dict:
    """What the apps get about access: never a dollar amount, only the share of the
    allowance used and when it resets."""
    return {
        "allowed": access.allowed,
        "code": access.code,
        "reason": access.reason,
        "allowance": None if access.used_pct is None else {
            "used_pct": access.used_pct,
            "resets_on": access.resets_on.isoformat(),
        },
    }


# --------------------------------------------------------------------------- endpoints

async def health(_request: Request):
    spec = await asyncio.to_thread(policy().model)
    return JSONResponse({"ok": True, "model": spec.label, "configured": spec.configured})


async def get_access(request: Request):
    """Cheap check the apps make before showing the assistant button at all:
    a company that hasn't been switched on never sees it."""
    got = await _caller(request)
    if isinstance(got, JSONResponse):
        return got
    live, _client = got
    access = await asyncio.to_thread(policy().check, live.me)
    return JSONResponse(_access_json(access))


async def get_conversation(request: Request):
    _purge()
    got = await _caller(request)
    if isinstance(got, JSONResponse):
        return got
    live, _client = got
    stored = live.stored or await asyncio.to_thread(store().get, live.key)
    access = await asyncio.to_thread(policy().check, live.me)
    model_id = stored.model_id if stored else (await asyncio.to_thread(policy().model)).id
    return JSONResponse({
        "model": _model_info(model_id),
        # the apps show `reason` instead of letting the user type into a dead end
        "access": _access_json(access),
        "busy": live.busy.locked(),
        "items": for_user(stored.transcript) if stored else [],
        "updated_at": stored.updated_at if stored else None,
    })


async def clear_conversation(request: Request):
    got = await _caller(request)
    if isinstance(got, JSONResponse):
        return got
    live, _client = got
    if live.busy.locked():
        return _err(409, "Still working on the last message — try again when it finishes.")
    await asyncio.to_thread(store().delete, live.key)
    with LIVE_LOCK:
        LIVE.pop(live.key, None)
    return JSONResponse({"ok": True})


async def post_message(request: Request):
    got = await _caller(request)
    if isinstance(got, JSONResponse):
        return got
    live, client = got
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return _err(400, "Invalid JSON.")
    text = (body.get("text") or "").strip()
    voice = bool(body.get("voice"))   # spoken question, spoken answer (style only; same tools and rules)
    if not text:
        return _err(400, "Empty message.")
    if len(text) > 4000:
        return _err(400, "Message too long (4,000 characters max).")
    access = await asyncio.to_thread(policy().check, live.me)
    if not access.allowed:
        return _err(access.status, access.reason)
    if not live.busy.acquire(blocking=False):
        return _err(409, "Still working on the previous message.")

    try:
        convo = await asyncio.to_thread(_ensure_conversation, live, client)
    except Exception as e:
        live.busy.release()
        return _err(503, str(e)[:300])

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    transcript = Transcript(live.stored.transcript)
    transcript.user(text, voice=voice)

    def persist():
        live.stored.messages = convo.messages
        live.stored.transcript = transcript.items
        store().save(live.stored)

    def emit(event: dict):
        transcript.event(event)
        if event["type"] == "confirm_resolved":
            persist()                   # an approval is a fact worth keeping right away
        loop.call_soon_threadsafe(queue.put_nowait, event)

    live.emit = emit
    persist()                           # the question is saved even if the turn fails

    start_len = len(convo.messages)

    def work():
        try:
            cb = Callbacks(on_text=lambda s: emit({"type": "text", "delta": s}),
                           on_status=lambda s: emit({"type": "status", "text": s}),
                           on_chart=lambda spec: emit({"type": "chart", "spec": spec}))
            r = convo.ask(text, cb, voice=voice)
            _record_usage(live, convo, "ok", voice, r)
            emit({"type": "done", "text": r.text, "stop_reason": r.stop_reason,
                  "allowance": _access_json(policy().check(live.me))["allowance"],
                  "seconds": round(r.seconds, 1), "model_calls": r.model_calls, "tool_calls": len(r.tool_calls),
                  "timing": {k: r.timing.get(k) for k in ("model_s", "tools_s", "first_text_s")}})
            print(f"[assistant] {r.seconds:.1f}s · model {r.timing.get('model_s')}s in {r.model_calls} calls · "
                  f"tools {r.timing.get('tools_s')}s · first text {r.timing.get('first_text_s')}s · "
                  f"calls {[c.get('wall_s') for c in r.timing.get('model_calls', [])]} · "
                  f"tools {[(t['tool'], t['s']) for t in r.timing.get('tools', [])]}", flush=True)
        except Exception as e:  # surface, never hang the stream
            # a half-finished turn (e.g. a tool call without its result) would make
            # every later request invalid: forget it in the model's memory
            del convo.messages[start_len:]
            _record_usage(live, convo, "error", voice, None)
            emit({"type": "error", "message": f"{type(e).__name__}: {e}"[:500]})
        finally:
            live.emit = None
            _deny_pending(live)
            transcript.finish()
            try:
                persist()
            finally:
                live.busy.release()
                loop.call_soon_threadsafe(queue.put_nowait, {"type": "_end"})

    threading.Thread(target=work, daemon=True).start()

    async def stream():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ": keep-alive\n\n"
                    continue
                if event.get("type") == "_end":
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        finally:
            # the browser left: it can't answer a confirmation any more. The turn
            # itself carries on and is saved, so a reload shows how it ended.
            _deny_pending(live)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def confirm(request: Request):
    got = await _caller(request)
    if isinstance(got, JSONResponse):
        return got
    live, _client = got
    body = await request.json()
    p = live.pending.get(body.get("confirm_id") or "")
    if p is None:
        return _err(404, "That confirmation is no longer pending.")
    approved = bool(body.get("approved"))
    if approved and getattr(p.request, "tier", "") == "strong" and (body.get("confirm_text") or "").strip() != "CONFIRM":
        return _err(400, "Type CONFIRM to approve this action.")
    p.approved = approved
    p.event.set()
    return JSONResponse({"ok": True, "approved": approved})


app = Starlette(
    routes=[
        Route("/assistant/health", health),
        Route("/assistant/access", get_access, methods=["GET"]),
        Route("/assistant/conversation", get_conversation, methods=["GET"]),
        Route("/assistant/conversation", clear_conversation, methods=["DELETE"]),
        Route("/assistant/conversation/messages", post_message, methods=["POST"]),
        Route("/assistant/conversation/confirm", confirm, methods=["POST"]),
    ],
    middleware=[Middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST", "DELETE"],
                           allow_headers=["Authorization", "Content-Type"])],
)


def main():
    # Production stays off until it has been signed off on dev: a deliberate
    # opt-in, not something a copied env file turns on by accident.
    if "prod" in (urlparse(KARMA_API).hostname or "") and os.environ.get("ASSISTANT_ALLOW_PROD") != "1":
        raise SystemExit(f"Refusing to serve against {KARMA_API}: set ASSISTANT_ALLOW_PROD=1 to run on production.")
    host = os.environ.get("ASSISTANT_HOST", "127.0.0.1")
    port = int(os.environ.get("ASSISTANT_PORT", "5077"))
    print(f"assistant: API {KARMA_API} · history {store().describe()}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
