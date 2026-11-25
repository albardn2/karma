"""Who may use the assistant, how much, and on which model.

Settings come from the super-admin console (stored by the API):
  - PlatformSetting 'assistant': {model_id, enabled_by_default, plan_price_usd,
    margin_pct, invoice_plans, user_messages_per_hour}
  - assistant_account_setting:   per company {enabled, plan_price_usd, margin_pct,
    user_messages_per_hour}; NULL = the platform default

A company's allowance is its plan's model-cost cap (plan.py), counted over its
current billing period, so it resets on the day the company is invoiced.

Checked before every question. Read through a short cache, so a change in the
console reaches every service instance within CACHE_S.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import date

from billing_cycle import current_period, damascus_today, day_start_utc

from .plan import CompanyPlan, company_plan, merge_platform
from .registry import DEFAULT_MODEL_ID, MODELS, ModelSpec
from .store import Store, account_of, hour_ago

CACHE_S = 30


@dataclass
class Access:
    allowed: bool
    status: int = 200
    reason: str = ""
    # why not: "off" (company not switched on: the apps hide the button),
    # "budget" or "rate" (the apps say why and keep the history readable)
    code: str = ""
    # what the apps show: share of this period's allowance used (None = no cap)
    # and the day it resets
    used_pct: int | None = None
    resets_on: date | None = None


class Policy:
    def __init__(self, store: Store):
        self.store = store
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[float, dict]] = {}

    def _cached(self, key: str, load) -> dict:
        now = time.monotonic()
        with self._lock:
            hit = self._cache.get(key)
            if hit and now - hit[0] < CACHE_S:
                return hit[1]
        value = load()
        with self._lock:
            self._cache[key] = (now, value)
        return value

    def clear_cache(self):
        with self._lock:
            self._cache.clear()

    def platform(self) -> dict:
        return self._cached("platform", lambda: merge_platform(self.store.platform_settings()))

    def account(self, account_uuid: str | None) -> CompanyPlan:
        """The company's effective switch and plan: its own where set, else the platform's."""
        own = self._cached(f"account:{account_uuid}", lambda: self.store.account_settings(account_uuid))
        return company_plan(self.platform(), own)

    def period(self, account_uuid: str | None) -> tuple[date, date]:
        """The company's current billing period. A caller with no company (a platform
        owner outside impersonation) runs on calendar months."""
        today = damascus_today()
        anchor = self._cached(f"anchor:{account_uuid}", lambda: self.store.account_anchor(account_uuid))
        return current_period(anchor or today.replace(day=1), today)

    def model(self) -> ModelSpec:
        """The model for NEW conversations. An existing conversation stays on the
        model it started with until the user clears it: a history is tied to the
        model that wrote it."""
        wanted = MODELS.get(self.platform().get("model_id") or "")
        if wanted and wanted.enabled and wanted.configured:
            return wanted
        return MODELS[DEFAULT_MODEL_ID]

    def check(self, me: dict) -> Access:
        """May this user ask a question right now?"""
        account_uuid = account_of(me)
        company = self.account(account_uuid)
        if not company.enabled:
            return Access(False, 403, "The assistant isn't switched on for your company. "
                                      "Ask Karma support to turn it on.", code="off")
        start, resets_on = self.period(account_uuid)
        spent = self.store.account_spend_since(account_uuid, day_start_utc(start))
        used_pct = company.plan.used_pct(spent)
        if company.plan.exhausted(spent):
            return Access(False, 429, "Your company has used all of this period's assistant allowance. "
                                      f"It resets on {resets_on.day} {resets_on:%B %Y}.",
                          code="budget", used_pct=used_pct, resets_on=resets_on)
        limit = company.user_messages_per_hour
        if limit and self.store.user_messages_since(me["uuid"], hour_ago()) >= int(limit):
            return Access(False, 429, f"You've asked {limit} questions in the last hour, the most allowed. "
                                      "Try again a little later.", code="rate", used_pct=used_pct,
                          resets_on=resets_on)
        return Access(True, used_pct=used_pct, resets_on=resets_on)
