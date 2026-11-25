"""A company's assistant plan: what it pays per billing period, and how much model
cost that buys.

The company pays `price_usd` a period. The platform keeps `margin_pct` of it and
spends the rest on the model, so questions stop once the period's model cost
reaches `price_usd * (1 - margin_pct / 100)`. Users only ever see how much of
that allowance they have used, as a percentage, never the dollar amounts.

Shared by the assistant service, which enforces the plan before every question,
and by the API, whose super-admin console shows it and whose billing invoices
it, so the three cannot disagree about a company's plan.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .registry import PLATFORM_DEFAULTS


@dataclass(frozen=True)
class Plan:
    # None: no plan, so usage is uncapped and nothing is invoiced
    price_usd: Optional[float]
    margin_pct: float

    @property
    def cost_cap_usd(self) -> Optional[float]:
        if self.price_usd is None:
            return None
        return self.price_usd * (1 - self.margin_pct / 100)

    def used_pct(self, cost_usd: float) -> Optional[int]:
        """Share of the allowance used, rounded down so 100 only shows once it is spent."""
        cap = self.cost_cap_usd
        if cap is None:
            return None
        if cap <= 0:
            return 100
        return min(100, math.floor(cost_usd / cap * 100))

    def exhausted(self, cost_usd: float) -> bool:
        cap = self.cost_cap_usd
        return cap is not None and cost_usd >= cap


@dataclass(frozen=True)
class CompanyPlan:
    enabled: bool
    plan: Plan


def merge_platform(saved: dict) -> dict:
    """The platform settings in force: the defaults, overridden by what an owner
    saved, including an explicit null (no cap)."""
    merged = dict(PLATFORM_DEFAULTS)
    merged.update({k: v for k, v in (saved or {}).items() if k in merged})
    return merged


def company_plan(platform: dict, own: dict) -> CompanyPlan:
    """A company's effective plan. `own` holds its saved `enabled`,
    `plan_price_usd` and `margin_pct`; a null one follows the platform."""
    enabled = own.get("enabled")
    price = own.get("plan_price_usd")
    margin = own.get("margin_pct")
    return CompanyPlan(
        enabled=platform["enabled_by_default"] if enabled is None else bool(enabled),
        plan=Plan(
            price_usd=platform["plan_price_usd"] if price is None else float(price),
            margin_pct=float(platform["margin_pct"] if margin is None else margin),
        ),
    )
