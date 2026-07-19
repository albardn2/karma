"""Platform-owner console: manage tenant accounts, blocking, subscriptions,
the payment ledger, and impersonation. Superuser ONLY (scopes_required
rejects tenant admins on superuser-only routes) and everything runs on an
UNSCOPED unit of work — this is cross-tenant by design."""
from datetime import timedelta, datetime

from flask import request, jsonify
from flask_jwt_extended import create_access_token, get_jwt_identity

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import PermissionScope
from app.dto.super_admin import (
    AccountUpdate,
    AccountRead,
    LedgerEntryCreate,
    LedgerEntryRead,
)
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.entrypoint.routes.super_admin import super_admin_blueprint
from models.common import (
    Account as AccountModel,
    AccountLedgerEntry as LedgerModel,
    User as UserModel,
)
from sqlalchemy import func

SUPER = PermissionScope.SUPER_ADMIN.value


def _balances(uow, account_uuid: str) -> dict:
    rows = (
        uow.session.query(LedgerModel.currency, func.sum(LedgerModel.amount))
        .filter(
            LedgerModel.account_uuid == account_uuid,
            LedgerModel.is_deleted.is_(False),
        )
        .group_by(LedgerModel.currency)
        .all()
    )
    return {cur: round(total, 2) for cur, total in rows}


def _account_or_404(uow, account_uuid: str) -> AccountModel:
    account = uow.account_repository.find_one(uuid=account_uuid, is_deleted=False)
    if not account:
        raise NotFoundError("Account not found")
    return account


def _account_read(uow, account: AccountModel) -> dict:
    dto = AccountRead.from_orm(account)
    dto.user_count = (
        uow.session.query(func.count(UserModel.uuid))
        .filter(UserModel.account_uuid == account.uuid, UserModel.is_deleted.is_(False))
        .scalar()
    )
    dto.balances = _balances(uow, account.uuid)
    return dto.model_dump(mode="json")


@super_admin_blueprint.route("/accounts", methods=["GET"])
@scopes_required(SUPER)
def list_accounts():
    page = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 20)), 100)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        pagination = uow.account_repository.find_all_by_filters_paginated(
            filters=[AccountModel.is_deleted.is_(False)],
            page=page,
            per_page=per_page,
        )
        result = {
            "accounts": [_account_read(uow, a) for a in pagination.items],
            "total_count": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total_pages": pagination.pages,
        }
    return jsonify(result), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>", methods=["GET"])
@scopes_required(SUPER)
def get_account(account_uuid: str):
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        account = _account_or_404(uow, account_uuid)
        result = _account_read(uow, account)
    return jsonify(result), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>", methods=["PUT"])
@scopes_required(SUPER)
def update_account(account_uuid: str):
    payload = AccountUpdate(**request.json)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        account = _account_or_404(uow, account_uuid)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(account, field, value)
        uow.account_repository.save(model=account, commit=False)
        result = _account_read(uow, account)
        uow.commit()
    return jsonify(result), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>/ledger", methods=["GET"])
@scopes_required(SUPER)
def list_ledger(account_uuid: str):
    page = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 20)), 100)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        _account_or_404(uow, account_uuid)
        pagination = uow.account_ledger_repository.find_all_by_filters_paginated(
            filters=[
                LedgerModel.account_uuid == account_uuid,
                LedgerModel.is_deleted.is_(False),
            ],
            page=page,
            per_page=per_page,
        )
        result = {
            "entries": [
                LedgerEntryRead.from_orm(e).model_dump(mode="json")
                for e in pagination.items
            ],
            "balances": _balances(uow, account_uuid),
            "total_count": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total_pages": pagination.pages,
        }
    return jsonify(result), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>/ledger", methods=["POST"])
@scopes_required(SUPER)
def create_ledger_entry(account_uuid: str):
    payload = LedgerEntryCreate(**request.json)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        account = _account_or_404(uow, account_uuid)

        currency = payload.currency or account.subscription_currency
        if not currency:
            raise BadRequestError(
                "currency is required (the account has no subscription currency set)"
            )

        if payload.entry_type == "payment":
            amount = abs(payload.amount)
        elif payload.entry_type == "charge":
            base = payload.amount if payload.amount is not None else account.subscription_rate
            if base is None:
                raise BadRequestError(
                    "amount is required (the account has no subscription rate set)"
                )
            amount = -abs(base)
        else:  # adjustment — signed as given
            amount = payload.amount

        entry = LedgerModel(
            account_uuid=account.uuid,
            entry_type=payload.entry_type,
            amount=amount,
            currency=currency,
            period=payload.period
            or (datetime.utcnow().strftime("%Y-%m") if payload.entry_type == "charge" else None),
            notes=payload.notes,
            created_by_uuid=get_jwt_identity(),
        )
        uow.account_ledger_repository.save(model=entry, commit=False)
        result = {
            "entry": LedgerEntryRead.from_orm(entry).model_dump(mode="json"),
            "balances": _balances(uow, account.uuid),
        }
        uow.commit()
    return jsonify(result), 201


@super_admin_blueprint.route("/accounts/<string:account_uuid>/impersonate", methods=["POST"])
@scopes_required(SUPER)
def impersonate(account_uuid: str):
    """Mint an access token that keeps the superuser's identity but operates
    inside the target account's tenant scope (see the before_request hook)."""
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        account = _account_or_404(uow, account_uuid)
        user = uow.user_repository.find_one(uuid=get_jwt_identity(), is_deleted=False)
        if not user or not user.is_superuser:
            raise BadRequestError("Only the platform owner can impersonate")
        scopes = user.permission_scope.split(",")
        access_token = create_access_token(
            identity=user.uuid,
            additional_claims={
                "scopes": scopes,
                "account_uuid": user.account_uuid,
                "imp_account_uuid": account.uuid,
            },
            expires_delta=timedelta(hours=8),
        )
        result = {
            "access_token": access_token,
            "account_uuid": account.uuid,
            "company_name": account.company_name,
        }
    return jsonify(result), 200
