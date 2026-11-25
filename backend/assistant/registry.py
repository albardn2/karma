"""The models the assistant can run on.

One entry per selectable model. The super-admin's choice (platform_setting
`assistant_model`, phase 1) is an `id` from this table; the spike takes it from
--model / ASSISTANT_MODEL instead. Adding a model = one entry here + an eval run.

API keys are never stored here or in the database: each entry names the
environment variable that holds its provider's key.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Price:
    """USD per million tokens."""
    input: float
    output: float
    cache_read: float | None = None
    cache_write: float | None = None  # 5-minute cache write


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    provider: str          # "anthropic" | "openai_compatible"
    api_model: str
    price: Price
    api_key_env: str
    base_url: str | None = None
    data_region: str = ""
    # capabilities the harness adapts to
    native_tool_search: bool = False
    code_tool_calling: bool = False
    prompt_caching: bool = False
    refusal_fallback: bool = False
    effort_levels: tuple = ()
    default_effort: str | None = None
    enabled: bool = True
    notes: str = ""

    @property
    def configured(self) -> bool:
        return bool(os.environ.get(self.api_key_env))


MODELS: dict[str, ModelSpec] = {
    m.id: m
    for m in [
        ModelSpec(
            id="anthropic:claude-opus-5-5",
            label="Claude Opus 5.5",
            provider="anthropic",
            api_model="claude-opus-5-5",
            price=Price(input=4.0, output=20.0, cache_read=0.20, cache_write=5.0),
            api_key_env="ANTHROPIC_API_KEY",
            data_region="Anthropic (US)",
            native_tool_search=True,
            code_tool_calling=True,
            prompt_caching=True,
            refusal_fallback=True,
            effort_levels=("low", "medium", "high", "xhigh", "max"),
            default_effort="medium",
        ),
        ModelSpec(
            id="anthropic:claude-sonnet-5-5",
            label="Claude Sonnet 5.5",
            provider="anthropic",
            api_model="claude-sonnet-5-5",
            price=Price(input=2.0, output=10.0, cache_read=0.10, cache_write=2.5),
            api_key_env="ANTHROPIC_API_KEY",
            data_region="Anthropic (US)",
            native_tool_search=True,
            code_tool_calling=True,
            prompt_caching=True,
            refusal_fallback=True,
            effort_levels=("low", "medium", "high", "xhigh", "max"),
            default_effort="medium",
            enabled=False,  # until it passes the eval
        ),
        ModelSpec(
            id="anthropic:claude-haiku-5-5",
            label="Claude Haiku 5.5",
            provider="anthropic",
            api_model="claude-haiku-5-5",
            price=Price(input=0.10, output=0.50),
            api_key_env="ANTHROPIC_API_KEY",
            data_region="Anthropic (US)",
            native_tool_search=True,
            code_tool_calling=False,  # not verified yet; the harness uses query_data instead
            prompt_caching=True,
            refusal_fallback=False,
            effort_levels=("low", "medium", "high", "xhigh", "max"),
            default_effort="medium",
            enabled=False,  # until it passes the eval
            notes="Prices for prompts up to 100K tokens.",
        ),
    ]
}

DEFAULT_MODEL_ID = "anthropic:claude-opus-5-5"

# Platform settings until a platform owner saves their own (PlatformSetting
# 'assistant'). Shared by the service (policy.py) and the super-admin API, so
# the console shows exactly what the service enforces.
PLATFORM_DEFAULTS = {
    "model_id": DEFAULT_MODEL_ID,
    "enabled_by_default": False,      # each company is switched on deliberately
    # per company, per billing period; null = no cap and nothing invoiced (see plan.py)
    "plan_price_usd": 20.0,
    "margin_pct": 20.0,               # the platform's share of the price; the rest buys model usage
    # off: plans cap usage but are not added to invoices until an owner turns this on
    "invoice_plans": False,
    "user_messages_per_hour": 60,     # per user; null = no cap
}


def resolve(model_id: str | None) -> ModelSpec:
    model_id = model_id or os.environ.get("ASSISTANT_MODEL") or DEFAULT_MODEL_ID
    if model_id not in MODELS:
        raise SystemExit(f"Unknown model {model_id!r}. Known: {', '.join(MODELS)}")
    return MODELS[model_id]


def cost_usd(spec: ModelSpec, usage: dict) -> float:
    p = spec.price
    total = usage.get("input_tokens", 0) * p.input + usage.get("output_tokens", 0) * p.output
    total += usage.get("cache_read_input_tokens", 0) * (p.cache_read if p.cache_read is not None else p.input)
    # cache writes: 1-hour ones at 2x input, the rest (5-minute) at the 5-minute rate
    writes = usage.get("cache_creation_input_tokens", 0)
    writes_1h = min(usage.get("cache_creation_1h_input_tokens", 0), writes)
    total += writes_1h * p.input * 2
    total += (writes - writes_1h) * (p.cache_write if p.cache_write is not None else p.input)
    return total / 1_000_000
