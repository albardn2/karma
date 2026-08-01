"""What a company can see about its OWN account.

Distinct from the super-admin console, which is the platform owner looking at every
tenant. This is a tenant looking at itself: what it subscribes to, what it has been
charged, and what it still owes. Read-only — payments are recorded by the platform
owner, because the company is not the one receiving the money.

`account` is deliberately NOT in RESOURCE_SET, so the per-endpoint ACL does not gate
it and `scopes_required` is the real gate: for a fine-grained (non-admin) caller,
`scopes_required` refuses any route whose required scopes are all admin scopes. A
tenant admin and the platform owner get in; a driver or a salesperson does not, which
is right — a company's subscription cost is not operational data.

Everything reads `g.account_uuid`, so an impersonating platform owner sees the tenant
they are impersonating rather than their own (empty) account.
"""
from flask import g, jsonify
from flask_jwt_extended import jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.billing import domain as billing
from app.dto.auth import PermissionScope
from app.entrypoint.routes.account import account_blueprint
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import Account as AccountModel
from models.common import AccountLedgerEntry as LedgerModel
from sqlalchemy import func

# How many ledger rows the billing tab shows. The list is a history, not a report:
# an owner wanting the whole thing has the super-admin console.
LEDGER_LIMIT = 100


@account_blueprint.route("/billing", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def my_billing():
    """This account's subscription, balance, and charge history with paid state."""
    account_uuid = getattr(g, "account_uuid", None)
    if not account_uuid:
        # A platform owner not impersonating anyone has no tenant to report on.
        raise NotFoundError("No account in scope")

    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        account = uow.session.query(AccountModel).filter(
            AccountModel.uuid == account_uuid,
            AccountModel.is_deleted.is_(False),
        ).one_or_none()
        if account is None:
            raise NotFoundError("Account not found")

        entries = (
            uow.session.query(LedgerModel)
            .filter(
                LedgerModel.account_uuid == account_uuid,
                LedgerModel.is_deleted.is_(False),
            )
            .order_by(LedgerModel.created_at.desc())
            .limit(LEDGER_LIMIT)
            .all()
        )

        charge_uuids = [e.uuid for e in entries if e.entry_type == "charge"]
        paid = billing.paid_amounts(uow, charge_uuids)
        # The settled charge's window, not just its month label: the period column
        # shows real from/to dates, and a payment should name the same window as the
        # charge it paid rather than a coarser version of it.
        settled = {
            row[0]: (row[1], row[2], row[3])
            for row in uow.session.query(
                LedgerModel.uuid, LedgerModel.period,
                LedgerModel.period_start, LedgerModel.period_end,
            ).filter(LedgerModel.uuid.in_(
                [e.settles_charge_uuid for e in entries if e.settles_charge_uuid]
            )).all()
        } if any(e.settles_charge_uuid for e in entries) else {}

        rows = []
        for e in entries:
            row = {
                "uuid": e.uuid,
                "entry_type": e.entry_type,
                "amount": round(e.amount, 2),
                "currency": e.currency,
                "period": e.period,
                "period_start": e.period_start.isoformat() if e.period_start else None,
                "period_end": e.period_end.isoformat() if e.period_end else None,
                "notes": e.notes,
                "created_at": e.created_at.isoformat(),
            }
            if e.entry_type == "charge":
                got = paid.get(e.uuid, 0.0)
                row["paid_amount"] = round(got, 2)
                row["outstanding"] = round(billing.outstanding(e, got), 2)
                row["is_paid"] = billing.is_paid(e, got)
            elif e.settles_charge_uuid:
                label, start, end = settled.get(e.settles_charge_uuid, (None, None, None))
                row["settles_period"] = label
                row["settles_period_start"] = start.isoformat() if start else None
                row["settles_period_end"] = end.isoformat() if end else None
            rows.append(row)

        balances = {
            cur: round(total, 2)
            for cur, total in uow.session.query(
                LedgerModel.currency, func.sum(LedgerModel.amount)
            ).filter(
                LedgerModel.account_uuid == account_uuid,
                LedgerModel.is_deleted.is_(False),
            ).group_by(LedgerModel.currency).all()
        }

        unpaid = billing.unpaid_charges(uow, account_uuid)
        total_outstanding: dict[str, float] = {}
        for charge, left in unpaid:
            total_outstanding[charge.currency] = round(
                total_outstanding.get(charge.currency, 0.0) + left, 2
            )

        # When the next charge falls due, so the page can say more than "you owe X".
        anchor = billing.billing_anchor(account)
        covered = billing.existing_charge_windows(uow, account_uuid)
        next_charge_on = max((e for _, e in covered), default=anchor)

        result = {
            "company_name": account.company_name,
            "subscription": {
                "rate": account.subscription_rate,
                "currency": account.subscription_currency,
                "type": account.subscription_type or "flat",
            },
            "billing_day": anchor.isoformat(),
            "next_charge_on": next_charge_on.isoformat(),
            "balances": balances,
            "total_outstanding": total_outstanding,
            "unpaid_count": len(unpaid),
            "entries": rows,
        }
    return jsonify(result), 200
