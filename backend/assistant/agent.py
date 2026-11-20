"""The agent loop: model ⇄ tools until the model answers.

Provider-neutral. The harness — not the model — decides what may run: the
executor only knows the tools this user was given, runs a write only after
the user confirms it, and sends every API call with the user's own token.
"""
from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Callable

from . import prompts
from .karma_client import KarmaClient
from .providers.base import Callbacks, Provider, ToolOutcome, make_provider
from .registry import ModelSpec, cost_usd
from .tools import Executor, ToolSpec, endpoint_tools, harness_tools

MAX_MODEL_CALLS = 30
VOICE_EFFORT = os.environ.get("ASSISTANT_VOICE_EFFORT", "low")


@dataclass
class TurnResult:
    text: str
    stop_reason: str
    model_calls: int
    tool_calls: list[dict]
    usage: dict
    cost_usd: float
    seconds: float
    # where the time went: model calls vs tools, and the first visible text
    timing: dict = field(default_factory=dict)


@dataclass
class Conversation:
    """One chat. Pinned to one model for its lifetime."""
    client: KarmaClient
    spec: ModelSpec
    code_calling: bool = False
    effort: str | None = None
    allow_writes: bool = True
    # Asked before every write with an actions.ConfirmRequest; returns True to proceed.
    # Default denies, so a caller with no way to ask the user can never write.
    confirm: Callable[[object], bool] = field(default=lambda req: False)
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    messages: list[dict] = field(default_factory=list)

    def __post_init__(self):
        self.client.conversation_id = self.id
        self.me = self.client.me()
        self.endpoint_tools: list[ToolSpec] = endpoint_tools(self.me, include_writes=self.allow_writes)
        self.tools = harness_tools(self.endpoint_tools, self.code_calling) + self.endpoint_tools
        self.executor = Executor(self.client, self.tools, allow_writes=self.allow_writes, confirm=self.confirm)
        self.provider: Provider = make_provider(self.spec, effort=self.effort, code_calling=self.code_calling)
        self._typed_effort = getattr(self.provider, "effort", None)
    def _last_context(self) -> str | None:
        for m in reversed(self.messages):
            if m.get("role") == "system":
                return m.get("content") if isinstance(m.get("content"), str) else None
        return None

    def ask(self, question: str, callbacks: Callbacks | None = None, voice: bool = False) -> TurnResult:
        cb = callbacks or Callbacks()
        self.executor.on_chart = cb.on_chart
        started = time.monotonic()
        self.messages.append(self.provider.user_message(question))
        # Who/when context goes in as an appended system message, and only when it
        # changed (new day, new role…). Editing the top-level system prompt instead
        # would change the conversation's prefix and invalidate the model's saved
        # reasoning on every turn.
        # switching voice mode on/off changes the context, so it is appended once
        # per switch (append-only, like any other context change)
        context = prompts.context_block(self.me, self.spec.label, self.allow_writes, voice=voice)
        if context != self._last_context():
            self.messages.append(self.provider.system_message(context))
        # Spoken questions run at a lower effort: measured ~25% faster on simple
        # questions with no loss on those (README "Speed"); typed ones keep the
        # model's default. Decided per question, so nothing carries over.
        self.provider.effort = (VOICE_EFFORT if voice and VOICE_EFFORT in self.spec.effort_levels
                                else self._typed_effort)
        usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                 "cache_creation_1h_input_tokens": 0, "cleared_input_tokens": 0}
        calls_log: list[dict] = []
        model_calls_t: list[dict] = []
        tool_t: list[dict] = []
        first_text_at = None
        text = ""
        stop = "end_turn"
        n = 0
        while n < MAX_MODEL_CALLS:
            n += 1
            tm = time.monotonic()
            turn = self.provider.run_turn(prompts.SYSTEM, self.messages, self.tools, cb)
            model_calls_t.append({**turn.timing, "wall_s": round(time.monotonic() - tm, 2),
                                  "out_tokens": turn.usage.get("output_tokens", 0)})
            if first_text_at is None and turn.timing.get("first_text_s") is not None:
                first_text_at = round(tm - started + turn.timing["first_text_s"], 2)
            for k in usage:
                usage[k] += turn.usage.get(k, 0)
            self.messages.append(turn.assistant_message)
            text, stop = turn.text, turn.stop_reason

            if stop == "refusal":
                text = turn.refusal or "The model declined this request."
                break
            if stop == "pause_turn":       # a server tool hit its iteration limit; continue as-is
                continue
            if stop == "max_tokens" and turn.tool_calls:
                text = "The answer was cut off (output limit reached). Please narrow the question."
                break
            if not turn.tool_calls:
                break

            outcomes = []
            for call in turn.tool_calls:
                if call.programmatic:
                    cb.on_status(f"code → {call.name}({_short(call.input)})")
                tt = time.monotonic()
                result, is_error = self.executor.run(call.name, call.input, call_id=call.id,
                                                     programmatic=call.programmatic)
                tool_t.append({"tool": call.name, "s": round(time.monotonic() - tt, 2)})
                calls_log.append({"tool": call.name, "input": call.input, "error": is_error,
                                  "programmatic": call.programmatic, "result_chars": len(result)})
                outcomes.append(ToolOutcome(call=call, text=result, is_error=is_error))
            self.messages.append(self.provider.tool_results_message(outcomes))
        else:
            text = text or "Stopped: too many steps for one question."
            stop = "step_limit"

        model_s = sum(c["wall_s"] for c in model_calls_t)
        tool_s = sum(t["s"] for t in tool_t)
        return TurnResult(
            text=text, stop_reason=stop, model_calls=n, tool_calls=calls_log, usage=usage,
            cost_usd=cost_usd(self.spec, usage), seconds=time.monotonic() - started,
            timing={"model_s": round(model_s, 2), "tools_s": round(tool_s, 2),
                    "first_text_s": first_text_at, "model_calls": model_calls_t, "tools": tool_t},
        )


def _short(d: dict, n: int = 120) -> str:
    s = ", ".join(f"{k}={v}" for k, v in (d or {}).items())
    return s if len(s) <= n else s[:n] + "…"
