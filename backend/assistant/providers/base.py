"""The interface every model provider implements.

The agent loop only ever talks to this. Conversation history is kept in the
provider's own wire format and pinned to the model that produced it (switching
models mid-conversation would break caching and the model's carried-over
reasoning), so the loop treats assistant messages as opaque and asks the
provider to build tool-result messages.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol

from ..registry import ModelSpec
from ..tools import ToolSpec


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict
    programmatic: bool = False   # issued from inside code execution


@dataclass
class ToolOutcome:
    call: ToolCall
    text: str
    is_error: bool = False


@dataclass
class ProviderTurn:
    assistant_message: dict              # appended to history as-is
    tool_calls: list[ToolCall]
    text: str
    stop_reason: str                     # end_turn | tool_use | pause_turn | max_tokens | refusal | ...
    usage: dict = field(default_factory=dict)
    refusal: str | None = None
    # wall-clock timing of this model call: first token of any kind, first
    # visible text, and the whole call (seconds)
    timing: dict = field(default_factory=dict)


@dataclass
class Callbacks:
    on_text: Callable[[str], None] = lambda s: None
    on_status: Callable[[str], None] = lambda s: None
    on_chart: Callable[[dict], None] = lambda spec: None


class Provider(Protocol):
    spec: ModelSpec

    def run_turn(self, system: str, messages: list[dict], tools: list[ToolSpec],
                 callbacks: Callbacks) -> ProviderTurn: ...

    def user_message(self, text: str) -> dict: ...

    def system_message(self, text: str) -> dict:
        """A mid-conversation operator message (appended after a user message)."""
        ...

    def tool_results_message(self, outcomes: list[ToolOutcome]) -> dict: ...


def make_provider(spec: ModelSpec, **options) -> Provider:
    if spec.provider == "anthropic":
        from .anthropic_provider import AnthropicProvider
        return AnthropicProvider(spec, **options)
    raise NotImplementedError(f"provider {spec.provider!r} is planned for phase 1b")
