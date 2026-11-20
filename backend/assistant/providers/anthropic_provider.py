"""Claude via the official Anthropic Python SDK.

Uses what Claude offers natively and the harness would otherwise emulate:
  - tool search (BM25) over the ~140 deferred endpoint tools,
  - programmatic tool calling (code execution calling `fetch_all`), optional,
  - prompt caching of the tools + system prefix,
  - effort control and server-side refusal fallback.
"""
from __future__ import annotations

import anthropic

from ..registry import ModelSpec
from ..tools import ToolSpec
from .base import Callbacks, ProviderTurn, ToolCall, ToolOutcome

TOOL_SEARCH = {"type": "tool_search_tool_bm25_20251119", "name": "tool_search_tool_bm25"}
CODE_EXECUTION = {"type": "code_execution_20260120", "name": "code_execution"}
CODE_CALLER = "code_execution_20260120"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
BLOCK_BINDING_BETA = "thinking-binding-controls-2026-08-01"
CONTEXT_EDITING_BETA = "context-management-2025-06-27"

# A chat sits idle between questions for minutes; with the default 5-minute
# cache every pause re-writes the whole conversation at full price. A 1-hour
# cache costs a little more per NEW token written and nothing on a re-read.
CACHE = {"type": "ephemeral", "ttl": "1h"}

# Old tool results (raw API pages, query results) are most of a long chat's
# tokens and are rarely needed again: the answers built from them stay. Once a
# request passes `trigger` tokens the API swaps older results for a placeholder,
# server-side only — the stored history is untouched and Claude's saved
# reasoning stays valid. `clear_at_least` batches the clearing so the prompt
# cache isn't invalidated on every request.
CONTEXT_EDITS = [{
    "type": "clear_tool_uses_20250919",
    "trigger": {"type": "input_tokens", "value": 20000},
    "keep": {"type": "tool_uses", "value": 4},
    "clear_at_least": {"type": "input_tokens", "value": 8000},
    # charts/maps results are short summaries the model refers back to; tool
    # search results carry the loaded tool references
    "exclude_tools": ["show_chart", "show_map", "tool_search_tool_bm25"],
}]


class AnthropicProvider:
    def __init__(self, spec: ModelSpec, effort: str | None = None, code_calling: bool = False,
                 max_tokens: int = 64000):
        self.spec = spec
        self.client = anthropic.Anthropic()  # ANTHROPIC_API_KEY from the environment
        self.effort = effort or spec.default_effort
        self.code_calling = code_calling and spec.code_tool_calling
        self.max_tokens = max_tokens
        self.container_id: str | None = None

    # ------------------------------------------------------------------ wire format

    def render_tools(self, tools: list[ToolSpec]) -> list[dict]:
        out: list[dict] = []
        if self.spec.native_tool_search and any(t.deferred for t in tools):
            out.append(TOOL_SEARCH)
        if self.code_calling:
            out.append(CODE_EXECUTION)
        for t in tools:
            if t.code_callable and not self.code_calling:
                continue
            d = {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            if t.deferred and self.spec.native_tool_search:
                d["defer_loading"] = True
            if t.code_callable:
                d["allowed_callers"] = [CODE_CALLER] if not t.direct_callable else ["direct", CODE_CALLER]
            out.append(d)
        return out

    def user_message(self, text: str) -> dict:
        return {"role": "user", "content": [{"type": "text", "text": text}]}

    def tool_results_message(self, outcomes: list[ToolOutcome]) -> dict:
        # all results in ONE user message, and nothing but tool_result blocks
        # (required while a programmatic call is pending)
        return {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": o.call.id, "content": o.text, **({"is_error": True} if o.is_error else {})}
            for o in outcomes
        ]}

    # ------------------------------------------------------------------ one model call

    def system_message(self, text: str) -> dict:
        # mid-conversation operator message: appended, never edited, so the
        # history stays a pure prefix of itself (see run_turn on block binding)
        return {"role": "system", "content": text}

    def run_turn(self, system: str, messages: list[dict], tools: list[ToolSpec],
                 callbacks: Callbacks) -> ProviderTurn:
        extra: dict = {"cache_control": CACHE, "context_management": {"edits": CONTEXT_EDITS}}
        if self.effort:
            extra["output_config"] = {"effort": self.effort}
        # Claude binds each thinking block to the exact system prompt + tools +
        # earlier messages that produced it. Saved conversations outlive both:
        # a deploy can change the prompt or tool descriptions, and an admin can
        # change a user's permissions (= their tool list). "drop_block" makes the
        # API discard reasoning blocks that no longer match instead of rejecting
        # the whole request; the visible conversation is unaffected.
        extra["thinking"] = {"type": "adaptive", "block_binding": {"prefix_mismatch_behavior": "drop_block"}}
        betas: list[str] = [BLOCK_BINDING_BETA, CONTEXT_EDITING_BETA]
        if self.spec.refusal_fallback:
            betas.append(FALLBACK_BETA)
            extra["fallbacks"] = "default"
        if self.code_calling and self.container_id:
            extra["container"] = self.container_id

        # stable for the life of a deploy: cached together with the tool definitions
        system_blocks = [{"type": "text", "text": system, "cache_control": CACHE}]
        kwargs = dict(
            model=self.spec.api_model,
            max_tokens=self.max_tokens,
            system=system_blocks,
            messages=messages,
            tools=self.render_tools(tools),
            extra_body=extra,
        )
        stream_ctx = self.client.beta.messages.stream(betas=betas, **kwargs)
        import time as _time
        t0 = _time.monotonic()
        first_token = first_text = None
        with stream_ctx as stream:
            for event in stream:
                if first_token is None and event.type in ("content_block_start", "content_block_delta"):
                    first_token = _time.monotonic() - t0
                if first_text is None and event.type == "content_block_delta" and event.delta.type == "text_delta":
                    first_text = _time.monotonic() - t0
                if event.type == "content_block_start":
                    b = event.content_block
                    if b.type == "server_tool_use":
                        callbacks.on_status("searching tools" if "tool_search" in b.name else "running analysis code")
                    elif b.type == "tool_use":
                        callbacks.on_status(f"calling {b.name}")
                elif event.type == "content_block_delta" and event.delta.type == "text_delta":
                    callbacks.on_text(event.delta.text)
            msg = stream.get_final_message()
        timing = {"first_token_s": round(first_token or 0, 2), "first_text_s": round(first_text, 2) if first_text else None,
                  "total_s": round(_time.monotonic() - t0, 2)}

        container = getattr(msg, "container", None)
        if container is not None and getattr(container, "id", None):
            self.container_id = container.id

        content = [b.model_dump(mode="json", exclude_none=True) for b in msg.content]
        calls = []
        text_parts = []
        for b in content:
            if b.get("type") == "tool_use":
                caller = b.get("caller") or {}
                calls.append(ToolCall(id=b["id"], name=b["name"], input=b.get("input") or {},
                                      programmatic=caller.get("type", "direct") != "direct"))
            elif b.get("type") == "text":
                text_parts.append(b.get("text", ""))

        u = msg.usage.model_dump(mode="json", exclude_none=True) if msg.usage else {}
        usage = {k: u.get(k, 0) or 0 for k in
                 ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}
        # 1-hour cache writes are billed at 2x input (5-minute ones at 1.25x)
        usage["cache_creation_1h_input_tokens"] = (u.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0) or 0
        cm = getattr(msg, "context_management", None)
        edits = getattr(cm, "applied_edits", None) or []
        usage["cleared_input_tokens"] = sum(getattr(e, "cleared_input_tokens", 0) or 0 for e in edits)
        refusal = None
        if msg.stop_reason == "refusal":
            details = getattr(msg, "stop_details", None)
            refusal = getattr(details, "explanation", None) or "The model declined this request."
        return ProviderTurn(
            assistant_message={"role": "assistant", "content": content},
            tool_calls=calls,
            text="".join(text_parts),
            stop_reason=msg.stop_reason or "end_turn",
            usage=usage,
            refusal=refusal,
            timing=timing,
        )
