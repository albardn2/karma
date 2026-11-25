"""Platform-owner console for the in-app assistant: which model it runs on,
which companies have it, each company's plan, what it has cost against what it
earns, and the log of every write it proposed. Superuser only, on an unscoped
unit of work.

The assistant service (backend/assistant) enforces these settings; it reads
them from the same tables within ~30 s of a change.
"""
from datetime import datetime
from typing import Optional

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity
from pydantic import BaseModel, ConfigDict, Field

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.assistant_plan import domain as assistant_plan
from app.domains.assistant_plan import history
from app.domains.billing import domain as billing
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.entrypoint.routes.super_admin import super_admin_blueprint
from assistant.registry import MODELS, PLATFORM_DEFAULTS
from billing_cycle import current_period
from models.common import (
    Account as AccountModel,
    AssistantAccountSetting,
    AssistantAction,
    PlatformSetting,
    User as UserModel,
)

SUPER = PermissionScope.SUPER_ADMIN.value
HISTORY_PER_PAGE_DEFAULT = 12
HISTORY_PER_PAGE_MAX = 60


def _models() -> list:
    return [{
        "id": m.id,
        "label": m.label,
        "enabled": m.enabled,
        "data_region": m.data_region,
        "price_per_mtok": {"input": m.price.input, "output": m.price.output},
        "notes": m.notes,
    } for m in MODELS.values()]


class PlatformAssistantSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_id: str
    enabled_by_default: bool
    plan_price_usd: Optional[float] = Field(default=None, ge=0)
    margin_pct: float = Field(ge=0, lt=100)
    invoice_plans: bool
    user_messages_per_hour: Optional[int] = Field(default=None, ge=1)


class AccountAssistantSettings(BaseModel):
    """null = follow the platform setting."""
    model_config = ConfigDict(extra="forbid")
    enabled: Optional[bool] = None
    plan_price_usd: Optional[float] = Field(default=None, ge=0)
    margin_pct: Optional[float] = Field(default=None, ge=0, lt=100)
    user_messages_per_hour: Optional[int] = Field(default=None, ge=1)


def _settings_response(uow) -> dict:
    return {"settings": assistant_plan.platform_settings(uow), "defaults": PLATFORM_DEFAULTS, "models": _models()}


@super_admin_blueprint.route("/settings/assistant", methods=["GET"])
@scopes_required(SUPER)
def get_assistant_settings():
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        result = _settings_response(uow)
    return jsonify(result), 200


@super_admin_blueprint.route("/settings/assistant", methods=["PUT"])
@scopes_required(SUPER)
def set_assistant_settings():
    """The model applies to NEW conversations; an existing one keeps its model
    until the user clears it (a history is tied to the model that wrote it)."""
    payload = PlatformAssistantSettings(**(request.json or {}))
    model = MODELS.get(payload.model_id)
    if model is None:
        raise BadRequestError(f"Unknown model {payload.model_id!r}")
    if not model.enabled:
        raise BadRequestError(f"{model.label} isn't available yet: it hasn't passed the assistant's evaluation")
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(key=assistant_plan.SETTING_KEY).one_or_none()
        if row:
            row.value = payload.model_dump()
        else:
            uow.session.add(PlatformSetting(key=assistant_plan.SETTING_KEY, value=payload.model_dump()))
        history.record_change(uow, None, payload.model_dump(), created_by_uuid=get_jwt_identity())
        uow.session.flush()
        result = _settings_response(uow)
        uow.commit()
    return jsonify(result), 200


def _round(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(value, 4)


def _account_row(uow, platform: dict, account: AccountModel, own: Optional[AssistantAccountSetting],
                 today) -> dict:
    company = assistant_plan.plan_for(platform, own)
    plan = company.plan
    period_start, period_end = current_period(billing.billing_anchor(account), today)
    usage = assistant_plan.usage_since(uow, account.uuid, period_start)
    revenue = plan.price_usd if company.enabled else None
    profit = None if revenue is None else revenue - usage.cost_usd
    return {
        "account_uuid": account.uuid,
        "company_name": account.company_name,
        # the company's own settings; null = platform default
        "enabled": own.enabled if own else None,
        "plan_price_usd": own.plan_price_usd if own else None,
        "margin_pct": own.margin_pct if own else None,
        "user_messages_per_hour": own.user_messages_per_hour if own else None,
        "effective_enabled": company.enabled,
        "effective_plan_price_usd": plan.price_usd,
        "effective_margin_pct": plan.margin_pct,
        "effective_user_messages_per_hour": company.user_messages_per_hour,
        "cost_cap_usd": _round(plan.cost_cap_usd),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "period_cost_usd": _round(usage.cost_usd),
        "period_questions": usage.questions,
        "used_pct": plan.used_pct(usage.cost_usd),
        # what the plan earns this period, and what is left once the model is paid
        "revenue_usd": revenue,
        "profit_usd": _round(profit),
        "profit_pct": history.profit_pct(revenue, profit),
    }


def _account_rows(uow, account_uuids=None) -> list:
    platform = assistant_plan.platform_settings(uow)
    today = billing.damascus_today()
    q = uow.session.query(AccountModel).filter(AccountModel.is_deleted.is_(False))
    if account_uuids is not None:
        q = q.filter(AccountModel.uuid.in_(account_uuids))
    accounts = q.order_by(AccountModel.company_name).all()
    own = assistant_plan.own_settings(uow, [a.uuid for a in accounts])
    return [_account_row(uow, platform, a, own.get(a.uuid), today) for a in accounts]


def _totals(rows: list) -> dict:
    cost = sum(r["period_cost_usd"] for r in rows)
    revenue = sum(r["revenue_usd"] or 0.0 for r in rows)
    return {
        "cost_usd": round(cost, 4),
        "revenue_usd": round(revenue, 2),
        "profit_usd": round(revenue - cost, 4),
        "profit_pct": history.profit_pct(revenue, revenue - cost),
    }


@super_admin_blueprint.route("/assistant/accounts", methods=["GET"])
@scopes_required(SUPER)
def list_assistant_accounts():
    """Every company: switched on?, its plan, and this billing period's cost and profit."""
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        rows = _account_rows(uow)
    return jsonify({"accounts": rows, "totals": _totals(rows)}), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>/assistant", methods=["PUT"])
@scopes_required(SUPER)
def set_account_assistant(account_uuid):
    payload = AccountAssistantSettings(**(request.json or {}))
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        if not uow.account_repository.find_one(uuid=account_uuid, is_deleted=False):
            raise NotFoundError("Account not found")
        row = uow.session.get(AssistantAccountSetting, account_uuid)
        if row is None:
            row = AssistantAccountSetting(account_uuid=account_uuid)
            uow.session.add(row)
        row.enabled = payload.enabled
        row.plan_price_usd = payload.plan_price_usd
        row.margin_pct = payload.margin_pct
        row.user_messages_per_hour = payload.user_messages_per_hour
        row.updated_at = datetime.utcnow()
        history.record_change(uow, account_uuid, payload.model_dump(), created_by_uuid=get_jwt_identity())
        uow.session.flush()
        result = _account_rows(uow, [account_uuid])[0]
        uow.commit()
    return jsonify(result), 200


def _page_args() -> tuple[int, int]:
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", HISTORY_PER_PAGE_DEFAULT)), 1), HISTORY_PER_PAGE_MAX)
    return page, per_page


@super_admin_blueprint.route("/assistant/history", methods=["GET"])
@scopes_required(SUPER)
def assistant_history():
    """All companies' assistant cost and profit by calendar month, newest first, a page at a time."""
    page, per_page = _page_args()
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        accounts = uow.session.query(AccountModel).filter(AccountModel.is_deleted.is_(False)).all()
        result = history.platform_page(uow, assistant_plan.platform_settings(uow),
                                       {a.uuid: billing.billing_anchor(a) for a in accounts},
                                       billing.damascus_today(), page, per_page)
    return jsonify({"months": result.items, "total_count": result.total_count, "page": page,
                    "per_page": per_page}), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>/assistant/history", methods=["GET"])
@scopes_required(SUPER)
def account_assistant_history(account_uuid):
    """One company's billing months, newest first, a page at a time."""
    page, per_page = _page_args()
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        account = uow.account_repository.find_one(uuid=account_uuid, is_deleted=False)
        if not account:
            raise NotFoundError("Account not found")
        result = history.company_page(uow, assistant_plan.platform_settings(uow), account.uuid,
                                      billing.billing_anchor(account), billing.damascus_today(), page, per_page)
    return jsonify({"months": [m.to_json() for m in result.items], "total_count": result.total_count,
                    "page": page, "per_page": per_page}), 200


@super_admin_blueprint.route("/assistant/actions", methods=["GET"])
@scopes_required(SUPER)
def list_assistant_actions():
    """The audit log: every write the assistant proposed, newest first."""
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 50)), 1), 200)
    account_uuid = request.args.get("account_uuid")
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        q = (uow.session.query(AssistantAction, UserModel.username, AccountModel.company_name)
             .outerjoin(UserModel, UserModel.uuid == AssistantAction.user_uuid)
             .outerjoin(AccountModel, AccountModel.uuid == AssistantAction.account_uuid))
        if account_uuid:
            q = q.filter(AssistantAction.account_uuid == account_uuid)
        total = q.count()
        items = (q.order_by(AssistantAction.created_at.desc())
                 .offset((page - 1) * per_page).limit(per_page).all())
        result = {
            "actions": [{
                "uuid": a.uuid,
                "created_at": a.created_at.isoformat(),
                "account_uuid": a.account_uuid,
                "company_name": company,
                "user_uuid": a.user_uuid,
                "username": username,
                "tier": a.tier,
                "method": a.method,
                "path": a.path,
                "title": a.title,
                "summary": a.summary,
                "decision": a.decision,
                "succeeded": a.decision == "approved" and a.status_code is None and a.error is None,
                "status_code": a.status_code,
                "error": a.error,
            } for a, username, company in items],
            "total_count": total,
            "page": page,
            "per_page": per_page,
        }
    return jsonify(result), 200
