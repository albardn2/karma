"""Platform-owner console for the in-app assistant: which model it runs on,
which companies have it, what each may spend, what it has cost, and the log of
every write it proposed. Superuser only, on an unscoped unit of work.

The assistant service (backend/assistant) enforces these settings; it reads
them from the same tables within ~30 s of a change.
"""
from datetime import datetime
from typing import Optional

from flask import jsonify, request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.entrypoint.routes.super_admin import super_admin_blueprint
from assistant.registry import MODELS, PLATFORM_DEFAULTS
from models.common import (
    Account as AccountModel,
    AssistantAccountSetting,
    AssistantAction,
    AssistantUsage,
    PlatformSetting,
    User as UserModel,
)

SUPER = PermissionScope.SUPER_ADMIN.value
SETTING_KEY = "assistant"


def _month_start() -> datetime:
    return datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _platform(uow) -> dict:
    row = uow.session.query(PlatformSetting).filter_by(key=SETTING_KEY).one_or_none()
    merged = dict(PLATFORM_DEFAULTS)
    merged.update({k: v for k, v in (row.value or {}).items() if k in merged} if row else {})
    return merged


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
    monthly_budget_usd: Optional[float] = Field(default=None, ge=0)
    user_messages_per_hour: Optional[int] = Field(default=None, ge=1)


class AccountAssistantSettings(BaseModel):
    """null = follow the platform setting."""
    model_config = ConfigDict(extra="forbid")
    enabled: Optional[bool] = None
    monthly_budget_usd: Optional[float] = Field(default=None, ge=0)


@super_admin_blueprint.route("/settings/assistant", methods=["GET"])
@scopes_required(SUPER)
def get_assistant_settings():
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        result = {"settings": _platform(uow), "defaults": PLATFORM_DEFAULTS, "models": _models()}
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
        row = uow.session.query(PlatformSetting).filter_by(key=SETTING_KEY).one_or_none()
        if row:
            row.value = payload.model_dump()
        else:
            uow.session.add(PlatformSetting(key=SETTING_KEY, value=payload.model_dump()))
        uow.session.flush()
        result = {"settings": _platform(uow), "defaults": PLATFORM_DEFAULTS, "models": _models()}
        uow.commit()
    return jsonify(result), 200


def _account_rows(uow, account_uuids=None) -> list:
    platform = _platform(uow)
    since = _month_start()
    q = uow.session.query(AccountModel).filter(AccountModel.is_deleted.is_(False))
    if account_uuids is not None:
        q = q.filter(AccountModel.uuid.in_(account_uuids))
    accounts = q.order_by(AccountModel.company_name).all()
    ids = [a.uuid for a in accounts]
    own = {s.account_uuid: s for s in uow.session.query(AssistantAccountSetting)
           .filter(AssistantAccountSetting.account_uuid.in_(ids)).all()} if ids else {}
    spend = dict(uow.session.query(AssistantUsage.account_uuid,
                                   func.coalesce(func.sum(AssistantUsage.cost_usd), 0.0))
                 .filter(AssistantUsage.account_uuid.in_(ids), AssistantUsage.created_at >= since)
                 .group_by(AssistantUsage.account_uuid).all()) if ids else {}
    questions = dict(uow.session.query(AssistantUsage.account_uuid, func.count(AssistantUsage.uuid))
                     .filter(AssistantUsage.account_uuid.in_(ids), AssistantUsage.created_at >= since)
                     .group_by(AssistantUsage.account_uuid).all()) if ids else {}
    rows = []
    for a in accounts:
        s = own.get(a.uuid)
        enabled = s.enabled if s else None
        budget = s.monthly_budget_usd if s else None
        rows.append({
            "account_uuid": a.uuid,
            "company_name": a.company_name,
            "enabled": enabled,                      # null = platform default
            "monthly_budget_usd": budget,            # null = platform default
            "effective_enabled": platform["enabled_by_default"] if enabled is None else enabled,
            "effective_budget_usd": platform["monthly_budget_usd"] if budget is None else budget,
            "month_spend_usd": round(float(spend.get(a.uuid, 0.0)), 4),
            "month_questions": int(questions.get(a.uuid, 0)),
        })
    return rows


@super_admin_blueprint.route("/assistant/accounts", methods=["GET"])
@scopes_required(SUPER)
def list_assistant_accounts():
    """Every company: switched on?, its budget, and this month's cost."""
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        rows = _account_rows(uow)
        result = {
            "accounts": rows,
            "month_start": _month_start().isoformat(),
            "month_spend_usd": round(sum(r["month_spend_usd"] for r in rows), 4),
        }
    return jsonify(result), 200


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
        row.monthly_budget_usd = payload.monthly_budget_usd
        row.updated_at = datetime.utcnow()
        uow.session.flush()
        result = _account_rows(uow, [account_uuid])[0]
        uow.commit()
    return jsonify(result), 200


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
