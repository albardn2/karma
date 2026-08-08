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
from app.domains.billing import domain as billing
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.entrypoint.routes.super_admin import super_admin_blueprint
from models.common import (
    MONEY_TOLERANCE,
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
        # Stamp the moment of admission, once. This is the billing anchor, so it is
        # deliberately NOT refreshed on a later re-verification: the account's whole
        # monthly grid hangs off it, and moving it would re-open periods that were
        # already charged or skip ones that were not.
        if account.is_verified and account.verified_at is None:
            account.verified_at = datetime.utcnow()
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
        # Settlement state for the charges on this page, in one grouped query rather
        # than one per row.
        paid = billing.paid_amounts(
            uow, [e.uuid for e in pagination.items if e.entry_type == "charge"]
        )
        # Which period each payment settled, so a payment row can say "August"
        # instead of leaving the reader to follow a uuid.
        settled_uuids = [
            e.settles_charge_uuid for e in pagination.items if e.settles_charge_uuid
        ]
        settled_windows = {
            row[0]: (row[1], row[2], row[3])
            for row in uow.session.query(
                LedgerModel.uuid, LedgerModel.period,
                LedgerModel.period_start, LedgerModel.period_end,
            ).filter(LedgerModel.uuid.in_(settled_uuids)).all()
        } if settled_uuids else {}

        entries = []
        for e in pagination.items:
            dto = LedgerEntryRead.from_orm(e).model_dump(mode="json")
            if e.entry_type == "charge":
                got = paid.get(e.uuid, 0.0)
                dto["paid_amount"] = round(got, 2)
                dto["outstanding"] = round(billing.outstanding(e, got), 2)
                dto["is_paid"] = billing.is_paid(e, got)
            elif e.settles_charge_uuid:
                label, start, end = settled_windows.get(
                    e.settles_charge_uuid, (None, None, None)
                )
                dto["settles_period"] = label
                dto["settles_period_start"] = start.isoformat() if start else None
                dto["settles_period_end"] = end.isoformat() if end else None
            entries.append(dto)

        result = {
            "entries": entries,
            "balances": _balances(uow, account_uuid),
            "total_count": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total_pages": pagination.pages,
        }
    return jsonify(result), 200


@super_admin_blueprint.route("/accounts/<string:account_uuid>/unpaid-charges",
                             methods=["GET"])
@scopes_required(SUPER)
def list_unpaid_charges(account_uuid: str):
    """The charges a payment can be applied to, oldest first.

    Not paginated, deliberately: the list is bounded by how many months an account
    has gone unpaid, and a picker that hides the oldest debt behind a second page is
    a picker that gets the wrong charge chosen.
    """
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        _account_or_404(uow, account_uuid)
        rows = billing.unpaid_charges(uow, account_uuid)
        result = {
            "charges": [
                {
                    "uuid": charge.uuid,
                    "period": charge.period,
                    "period_start": charge.period_start.isoformat() if charge.period_start else None,
                    "period_end": charge.period_end.isoformat() if charge.period_end else None,
                    "amount": round(abs(charge.amount), 2),
                    "outstanding": round(left, 2),
                    "currency": charge.currency,
                }
                for charge, left in rows
            ],
            "total_outstanding": {},
        }
        for charge, left in rows:
            result["total_outstanding"][charge.currency] = round(
                result["total_outstanding"].get(charge.currency, 0.0) + left, 2
            )
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

        auto_note = None
        period_start = period_end = None
        if payload.entry_type == "charge":
            # The amount arithmetic lives in the billing domain so that this route
            # and the daily job cannot drift apart — a charge computed two slightly
            # different ways is the kind of bug nobody notices until a customer
            # disputes it. See app/domains/billing/domain.py.
            try:
                amount, auto_note = billing.charge_amount(uow, account, base=payload.amount)
            except ValueError as exc:
                raise BadRequestError(f"amount is required ({exc})")
            # A hand-raised charge still gets a coverage window, or the daily job
            # would not see it as covering anything and would bill the same month
            # again. Takes the account's earliest UNBILLED monthly period, which is
            # exactly what the job would have raised next; if nothing is outstanding
            # it opens the next period on the grid, so an owner charging early stays
            # on the same anniversary.
            anchor = billing.billing_anchor(account)
            today = billing.damascus_today()
            outstanding = billing.missing_periods(uow, account.uuid, anchor, today)
            if outstanding:
                period_start, period_end = outstanding[0]
            else:
                covered = billing.existing_charge_windows(uow, account.uuid)
                nxt = max((e for _, e in covered), default=today)
                period_start, period_end = nxt, billing.add_months(nxt, 1)
        elif payload.entry_type == "payment":
            amount = abs(payload.amount)
            if payload.settles_charge_uuid:
                charge = uow.session.query(LedgerModel).filter(
                    LedgerModel.uuid == payload.settles_charge_uuid,
                    LedgerModel.account_uuid == account.uuid,
                    LedgerModel.entry_type == "charge",
                    LedgerModel.is_deleted.is_(False),
                ).one_or_none()
                # Scoped to THIS account on purpose: without the account_uuid filter
                # a payment could be pointed at another tenant's charge and settle
                # someone else's debt.
                if charge is None:
                    raise BadRequestError(
                        "settles_charge_uuid is not an open charge on this account"
                    )
                if charge.currency != currency:
                    raise BadRequestError(
                        f"payment is {currency} but that charge is {charge.currency}"
                    )
                already = billing.paid_amounts(uow, [charge.uuid]).get(charge.uuid, 0.0)
                left = billing.outstanding(charge, already)
                # Rejected rather than silently absorbed: an overpayment aimed at one
                # month is almost always a typo, and if it is not, the money belongs
                # on the account as an unallocated payment where it can be applied
                # deliberately.
                if amount - left > MONEY_TOLERANCE:
                    raise BadRequestError(
                        f"that charge only has {left:.2f} {currency} outstanding; "
                        f"record the rest as a payment with no charge selected"
                    )
        else:  # adjustment — signed as given
            amount = payload.amount

        entry = LedgerModel(
            account_uuid=account.uuid,
            entry_type=payload.entry_type,
            amount=amount,
            currency=currency,
            period=payload.period
            or (period_start.strftime("%Y-%m") if period_start else None),
            period_start=period_start,
            period_end=period_end,
            notes=payload.notes or auto_note,
            settles_charge_uuid=(
                payload.settles_charge_uuid if payload.entry_type == "payment" else None
            ),
            created_by_uuid=get_jwt_identity(),
        )
        uow.account_ledger_repository.save(model=entry, commit=False)
        result = {
            "entry": LedgerEntryRead.from_orm(entry).model_dump(mode="json"),
            "balances": _balances(uow, account.uuid),
        }
        uow.commit()
    return jsonify(result), 201


@super_admin_blueprint.route("/settings/default-account-permissions", methods=["GET"])
@scopes_required(SUPER)
def get_default_account_permissions():
    from models.common import PlatformSetting
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(
            key="default_account_permissions").one_or_none()
        result = {"permissions": row.value if row else None}
    return jsonify(result), 200


@super_admin_blueprint.route("/settings/default-account-permissions", methods=["PUT"])
@scopes_required(SUPER)
def set_default_account_permissions():
    """Feature cap stamped onto NEW accounts at signup. Explicit null means
    new accounts start unrestricted. Existing accounts are never touched."""
    from pydantic import BaseModel, ConfigDict
    from typing import Optional
    from app.dto.auth import UserPermissions
    from models.common import PlatformSetting

    class _Body(BaseModel):
        model_config = ConfigDict(extra="forbid")
        permissions: Optional[UserPermissions] = None

    payload = _Body(**request.json)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(
            key="default_account_permissions").one_or_none()
        value = payload.permissions.model_dump() if payload.permissions else None
        if row:
            row.value = value
        else:
            row = PlatformSetting(key="default_account_permissions", value=value)
            uow.session.add(row)
        uow.session.flush()
        result = {"permissions": row.value}
        uow.commit()
    return jsonify(result), 200


def _role_preset_payload(uow):
    """Every role's defaults, plus what an editor needs to act safely.

    `baseline` is the generated-from-decorators floor, so the UI can offer "reset
    to default" and show what an override changed. `following` is the blast radius:
    how many users actually inherit this role's defaults right now, which is the
    number that matters before widening or narrowing a role.
    """
    from app.entrypoint.routes.common.permissions import (
        ROLE_PRESETS_BASELINE,
        resolved_role_presets,
        role_overrides,
    )
    from models.common import User as UserModel

    overrides = role_overrides()
    resolved = resolved_role_presets()

    # Users who FOLLOW the role: no explicit per-user override. Users with their
    # own checklist are deliberately excluded — editing a role's defaults does
    # not touch them, and counting them here would overstate the impact.
    counts = dict(
        uow.session.query(UserModel.permission_scope, func.count(UserModel.uuid))
        .filter(
            UserModel.is_deleted.is_(False),
            UserModel.permissions.is_(None),
        )
        .group_by(UserModel.permission_scope)
        .all()
    )

    return {
        "roles": [
            {
                "role": role,
                "permissions": resolved[role],
                "baseline": ROLE_PRESETS_BASELINE[role],
                "is_overridden": role in overrides and bool(overrides[role]),
                "following": counts.get(role, 0),
            }
            for role in sorted(ROLE_PRESETS_BASELINE)
        ]
    }


@super_admin_blueprint.route("/settings/role-presets", methods=["GET"])
@scopes_required(SUPER)
def get_role_presets():
    """Per-role default permissions. A user with no explicit checklist is governed
    by their role's entry here."""
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        result = _role_preset_payload(uow)
    return jsonify(result), 200


@super_admin_blueprint.route("/settings/role-presets/<string:role>", methods=["PUT"])
@scopes_required(SUPER)
def set_role_preset(role: str):
    """Override one role's default permissions, platform-wide.

    Takes effect without a deploy: every user following this role is re-governed
    on their next request, and the perms-version header tells their already-open
    clients to re-read their profile rather than keep a stale menu.
    """
    from pydantic import BaseModel, ConfigDict
    from app.dto.auth import UserPermissions
    from app.entrypoint.routes.common.permissions import (
        ROLE_PRESETS_BASELINE,
        ROLE_PRESETS_SETTING_KEY,
        invalidate_role_overrides,
    )
    from models.common import PlatformSetting

    # Only roles that HAVE defaults. admin/superuser are excluded because they
    # bypass the ACL entirely (effective_permissions returns None for them), so a
    # preset for them would be stored, displayed, and silently ignored.
    if role not in ROLE_PRESETS_BASELINE:
        raise BadRequestError(
            f"unknown role {role!r} — must be one of "
            f"{sorted(ROLE_PRESETS_BASELINE)}"
        )

    class _Body(BaseModel):
        model_config = ConfigDict(extra="forbid")
        # Required, not optional: an explicit null here would be ambiguous
        # between "clear the override" and "grant nothing", and those differ by
        # everything. Clearing is DELETE.
        permissions: UserPermissions

    payload = _Body(**request.json)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(
            key=ROLE_PRESETS_SETTING_KEY).one_or_none()
        # Rebuilt rather than mutated in place: MutableDict tracks top-level key
        # assignment, and updating a nested dict would not always be flagged dirty.
        value = dict(row.value) if row and row.value else {}
        value[role] = payload.permissions.model_dump()
        if row:
            row.value = value
        else:
            uow.session.add(
                PlatformSetting(key=ROLE_PRESETS_SETTING_KEY, value=value)
            )
        # COMMIT BEFORE invalidating and re-reading, in that order. role_overrides()
        # reads through its own short-lived session, so it cannot see this
        # transaction's uncommitted writes: invalidating first made the very next
        # read cache the stale pre-commit value with a FRESH timestamp, which then
        # served the old defaults for the whole TTL. Caught by the endpoint
        # reporting is_overridden=false on a row that had in fact been written.
        uow.commit()
        invalidate_role_overrides()
        result = _role_preset_payload(uow)
    return jsonify(result), 200


@super_admin_blueprint.route("/settings/role-presets/<string:role>", methods=["DELETE"])
@scopes_required(SUPER)
def reset_role_preset(role: str):
    """Drop the override and return this role to the generated baseline."""
    from app.entrypoint.routes.common.permissions import (
        ROLE_PRESETS_BASELINE,
        ROLE_PRESETS_SETTING_KEY,
        invalidate_role_overrides,
    )
    from models.common import PlatformSetting

    if role not in ROLE_PRESETS_BASELINE:
        raise BadRequestError(f"unknown role {role!r}")

    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(
            key=ROLE_PRESETS_SETTING_KEY).one_or_none()
        if row and row.value and role in row.value:
            value = dict(row.value)
            value.pop(role, None)
            row.value = value
        # Same ordering rule as the PUT: commit, then invalidate, then read.
        uow.commit()
        invalidate_role_overrides()
        result = _role_preset_payload(uow)
    return jsonify(result), 200


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


# ---------------------------------------------------------------------------
# Role -> dashboards: which of the pre-defined dashboards each role sees.
# Platform-wide, like role-presets: one config for every tenant, written only by
# the platform owner. A separate concern from role permissions, so it lives in
# its own PlatformSetting key and never appears in the CRUD permission checklist.
# ---------------------------------------------------------------------------


def _role_dashboards_payload(uow):
    """Every configurable role's dashboard ids, plus what the matrix needs to act
    safely: the baseline (so it can offer reset + show what an override changed),
    whether each role is overridden, and how many users follow the role."""
    from app.entrypoint.routes.common.permissions import (
        DASHBOARD_CATALOG,
        DASHBOARD_DEFAULTS,
        resolved_role_dashboards,
        role_dashboard_overrides,
    )
    from models.common import User as UserModel

    overrides = role_dashboard_overrides()
    resolved = resolved_role_dashboards()
    counts = dict(
        uow.session.query(UserModel.permission_scope, func.count(UserModel.uuid))
        .filter(UserModel.is_deleted.is_(False), UserModel.permissions.is_(None))
        .group_by(UserModel.permission_scope)
        .all()
    )
    return {
        "catalog": DASHBOARD_CATALOG,
        "roles": {
            role: {
                "dashboards": resolved[role],
                "baseline": DASHBOARD_DEFAULTS[role],
                "is_overridden": role in overrides,
                "following_count": counts.get(role, 0),
            }
            for role in DASHBOARD_DEFAULTS
        },
    }


@super_admin_blueprint.route("/settings/role-dashboards", methods=["GET"])
@scopes_required(SUPER)
def get_role_dashboards():
    """Per-role dashboard assignment for the super-admin matrix."""
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        result = _role_dashboards_payload(uow)
    return jsonify(result), 200


@super_admin_blueprint.route("/settings/role-dashboards/<string:role>", methods=["PUT"])
@scopes_required(SUPER)
def set_role_dashboards(role: str):
    """Set which dashboards one role sees, platform-wide.

    Takes effect without a deploy: the perms-version fingerprint folds the
    dashboard set in, so every open client of a user following this role re-reads
    /auth/me on its next request and re-renders its dashboard strip.
    """
    from pydantic import BaseModel, ConfigDict, field_validator
    from app.entrypoint.routes.common.permissions import (
        DASHBOARD_DEFAULTS,
        DASHBOARD_IDS,
        ROLE_DASHBOARDS_SETTING_KEY,
        invalidate_role_dashboards,
    )
    from models.common import PlatformSetting

    # admin/superuser are excluded: they see every dashboard by construction, so
    # an entry for them would be stored, shown, and silently ignored.
    if role not in DASHBOARD_DEFAULTS:
        raise BadRequestError(
            f"unknown role {role!r} — must be one of {sorted(DASHBOARD_DEFAULTS)}"
        )

    class _Body(BaseModel):
        model_config = ConfigDict(extra="forbid")
        dashboards: list[str]

        @field_validator("dashboards")
        @classmethod
        def _known_ids(cls, v):
            # reject unknown ids rather than store a dangling grant no client can
            # ever render; dedupe while preserving order
            seen, out = set(), []
            for i in v:
                if i not in DASHBOARD_IDS:
                    raise ValueError(
                        f"unknown dashboard {i!r} — must be one of {sorted(DASHBOARD_IDS)}"
                    )
                if i not in seen:
                    seen.add(i)
                    out.append(i)
            return out

    payload = _Body(**request.json)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(
            key=ROLE_DASHBOARDS_SETTING_KEY).one_or_none()
        # rebuilt, not mutated: MutableDict tracks top-level assignment only
        value = dict(row.value) if row and row.value else {}
        value[role] = payload.dashboards
        if row:
            row.value = value
        else:
            uow.session.add(
                PlatformSetting(key=ROLE_DASHBOARDS_SETTING_KEY, value=value)
            )
        # commit, THEN invalidate — same ordering rule as the role presets: the
        # override read goes through its own session and cannot see an uncommitted
        # write, so invalidating first would re-cache the stale value with a fresh
        # timestamp and serve it for the whole TTL.
        uow.commit()
        invalidate_role_dashboards()
        result = _role_dashboards_payload(uow)
    return jsonify(result), 200


@super_admin_blueprint.route("/settings/role-dashboards/<string:role>", methods=["DELETE"])
@scopes_required(SUPER)
def reset_role_dashboards(role: str):
    """Drop the override and return this role to the baseline dashboard set."""
    from app.entrypoint.routes.common.permissions import (
        DASHBOARD_DEFAULTS,
        ROLE_DASHBOARDS_SETTING_KEY,
        invalidate_role_dashboards,
    )
    from models.common import PlatformSetting

    if role not in DASHBOARD_DEFAULTS:
        raise BadRequestError(f"unknown role {role!r}")

    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        row = uow.session.query(PlatformSetting).filter_by(
            key=ROLE_DASHBOARDS_SETTING_KEY).one_or_none()
        if row and row.value and role in row.value:
            value = dict(row.value)
            value.pop(role, None)
            row.value = value
        uow.commit()
        invalidate_role_dashboards()
        result = _role_dashboards_payload(uow)
    return jsonify(result), 200
