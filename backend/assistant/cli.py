"""Chat with Karma Assistant in the terminal, against a LOCAL Karma API.

    cd backend
    export ANTHROPIC_API_KEY=...            # your key; never commit it
    uv run --python 3.12 --with-requirements assistant/requirements.txt \
        python -m assistant.cli --username admin

Options: --api (default http://localhost:5000), --model (registry id),
--effort, --code (programmatic tool calling), -q "one question" (non-interactive).
Password: KARMA_PASSWORD env var, or prompted.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys
from urllib.parse import urlparse

from . import charts, maps
from .agent import Conversation
from .karma_client import KarmaClient
from .providers.base import Callbacks
from .registry import resolve

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def confirm_in_terminal(request) -> bool:
    """Show a write and wait for the user. Ordinary writes: y. Money/stock/deletes: CONFIRM."""
    strong = request.tier == "strong"
    bar = "=" * 64
    print(f"\n\n{bar}\n{'⚠  MONEY / STOCK / DELETE — ' if strong else ''}CONFIRM ACTION: {request.render()}\n{bar}", flush=True)
    try:
        if strong:
            answer = input("Type CONFIRM to proceed, anything else cancels: ").strip()
            ok = answer == "CONFIRM"
        else:
            answer = input("Proceed? [y/N]: ").strip().lower()
            ok = answer in ("y", "yes")
    except EOFError:
        ok = False
    print("  → approved" if ok else "  → cancelled, nothing changed", flush=True)
    return ok


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default=os.environ.get("KARMA_API", "http://localhost:5000"))
    ap.add_argument("--username", default=os.environ.get("KARMA_USERNAME"))
    ap.add_argument("--model", default=None)
    ap.add_argument("--effort", default=None)
    ap.add_argument("--code", action="store_true", help="enable programmatic tool calling (code execution)")
    ap.add_argument("--read-only", action="store_true", help="turn actions (writes) off")
    ap.add_argument("-q", "--question", default=None)
    ap.add_argument("--allow-remote-api", action="store_true",
                    help="permit a non-localhost API (the spike is meant for local data only)")
    args = ap.parse_args(argv)

    host = urlparse(args.api).hostname or ""
    if host not in LOCAL_HOSTS and not args.allow_remote_api:
        sys.exit(f"Refusing to run against {args.api}: the spike is for a LOCAL Karma API only.")

    spec = resolve(args.model)
    if not spec.configured:
        sys.exit(f"{spec.api_key_env} is not set; {spec.label} cannot be used.")
    username = args.username or input("Karma username: ")
    password = os.environ.get("KARMA_PASSWORD") or getpass.getpass("Karma password: ")
    client = KarmaClient.login(args.api, username, password)
    convo = Conversation(client=client, spec=spec, code_calling=args.code, effort=args.effort,
                         allow_writes=not args.read_only, confirm=confirm_in_terminal)
    writes = sum(1 for t in convo.endpoint_tools if not t.is_read)
    print(f"[{spec.label} · effort {convo.provider.effort} · {len(convo.endpoint_tools) - writes} read + "
          f"{writes} write tools{' · code' if args.code else ''} · conversation {convo.id}]")
    if writes:
        print("[actions ON: every change is shown to you first and needs your approval]")

    cb = Callbacks(
        on_text=lambda s: print(s, end="", flush=True),
        on_status=lambda s: print(f"\n  · {s}", file=sys.stderr, flush=True),
        on_chart=lambda spec: print("\n" + (maps.to_text(spec) if spec.get("type") == "map" else charts.to_text(spec))
                                    + "\n", flush=True),
    )

    def one(q):
        r = convo.ask(q, cb)
        print()
        print(f"[{r.model_calls} model calls · {len(r.tool_calls)} tool calls · "
              f"{r.usage['input_tokens']}+{r.usage['cache_read_input_tokens']}c in / {r.usage['output_tokens']} out · "
              f"${r.cost_usd:.3f} · {r.seconds:.1f}s · {r.stop_reason}]", file=sys.stderr)

    if args.question:
        one(args.question)
        return
    while True:
        try:
            q = input("\nyou › ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if q in ("exit", "quit"):
            return
        if q:
            one(q)


if __name__ == "__main__":
    main()
