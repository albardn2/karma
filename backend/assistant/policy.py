"""Who may use the assistant, how much, and on which model.

Settings come from the super-admin console (stored by the API):
  - PlatformSetting 'assistant': {model_id, enabled_by_default,
    monthly_budget_usd, user_messages_per_hour}
  - assistant_account_setting:   per company {enabled, monthly_budget_usd};
    NULL = the platform default

Checked before every question. Read through a short cache, so a change in the
console reaches every service instance within CACHE_S.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from .registry import DEFAULT_MODEL_ID, MODELS, PLATFORM_DEFAULTS, ModelSpec
from .store import Store, account_of, hour_ago, month_start

CACHE_S = 30


def defaults() -> dict:
    """Used until a platform owner saves settings: off for every company, so
    each is switched on deliberately in Super Admin -> Assistant. No env
    overrides — the console must show exactly what is enforced."""
    return dict(PLATFORM_DEFAULTS)


@dataclass
class Access:
    allowed: bool
    status: int = 200
    reason: str = ""
    budget_usd: float | None = None
    spent_usd: float = 0.0


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
        def load():
            merged = defaults()
            # saved values win, including an explicit null budget/limit (= no cap)
            merged.update({k: v for k, v in self.store.platform_settings().items() if k in merged})
            return merged
        return self._cached("platform", load)

    def account(self, account_uuid: str | None) -> dict:
        """The company's effective settings: its own where set, else the platform's."""
        p = self.platform()
        own = self._cached(f"account:{account_uuid}", lambda: self.store.account_settings(account_uuid))
        enabled = own.get("enabled")
        budget = own.get("monthly_budget_usd")
        return {
            "enabled": p["enabled_by_default"] if enabled is None else bool(enabled),
            "monthly_budget_usd": p.get("monthly_budget_usd") if budget is None else budget,
            "user_messages_per_hour": p.get("user_messages_per_hour"),
        }

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
        s = self.account(account_uuid)
        if not s["enabled"]:
            return Access(False, 403, "The assistant isn't switched on for your company. "
                                      "Ask Karma support to turn it on.")
        budget = s["monthly_budget_usd"]
        spent = self.store.account_spend_since(account_uuid, month_start())
        if budget is not None and spent >= float(budget):
            return Access(False, 429, "Your company has used this month's assistant allowance. "
                                      "It resets on the 1st, or Karma support can raise it.",
                          budget_usd=budget, spent_usd=spent)
        limit = s["user_messages_per_hour"]
        if limit and self.store.user_messages_since(me["uuid"], hour_ago()) >= int(limit):
            return Access(False, 429, f"You've asked {limit} questions in the last hour, the most allowed. "
                                      "Try again a little later.", budget_usd=budget, spent_usd=spent)
        return Access(True, budget_usd=budget, spent_usd=spent)
