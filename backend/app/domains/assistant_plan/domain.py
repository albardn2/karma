"""The assistant plans as the API sees them: the super-admin console shows them,
and billing invoices them. The assistant service enforces the same plans from the
same settings; assistant/plan.py holds the arithmetic both sides use.
"""
from __future__ import annotations

from datetime import date
from typing import NamedTuple, Optional

from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from assistant.plan import CompanyPlan, company_plan, merge_platform
from billing_cycle import day_start_utc
from models.common import AssistantAccountSetting, AssistantUsage, PlatformSetting

SETTING_KEY = "assistant"


class PeriodUsage(NamedTuple):
    cost_usd: float
    questions: int


def platform_settings(uow: SqlAlchemyUnitOfWork) -> dict:
    row = uow.session.query(PlatformSetting).filter_by(key=SETTING_KEY).one_or_none()
    return merge_platform(row.value if row else {})


def own_settings(uow: SqlAlchemyUnitOfWork, account_uuids: list[str]) -> dict[str, AssistantAccountSetting]:
    if not account_uuids:
        return {}
    rows = (uow.session.query(AssistantAccountSetting)
            .filter(AssistantAccountSetting.account_uuid.in_(account_uuids)).all())
    return {row.account_uuid: row for row in rows}


def plan_for(platform: dict, own: Optional[AssistantAccountSetting]) -> CompanyPlan:
    if own is None:
        return company_plan(platform, {})
    return company_plan(platform, {
        "enabled": own.enabled,
        "plan_price_usd": own.plan_price_usd,
        "margin_pct": own.margin_pct,
    })


def usage_since(uow: SqlAlchemyUnitOfWork, account_uuid: str, period_start: date) -> PeriodUsage:
    cost, questions = (
        uow.session.query(func.coalesce(func.sum(AssistantUsage.cost_usd), 0.0), func.count(AssistantUsage.uuid))
        .filter(AssistantUsage.account_uuid == account_uuid,
                AssistantUsage.created_at >= day_start_utc(period_start))
        .one()
    )
    return PeriodUsage(cost_usd=float(cost or 0.0), questions=int(questions or 0))
