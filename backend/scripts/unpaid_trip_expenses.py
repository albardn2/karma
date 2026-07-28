"""List trip expenses that no live payout covers, and the trips they move.

Until this was fixed, `Trip.net_expected_cash` deducted an expense's face value
whether or not anyone had paid it, so a booked-but-unpaid cost credited the
driver for money still in their hands. The deduction is now what was actually
paid out; this script says whether the old behaviour ever bit — which trips'
reconciliation figures change, and by how much.

Read-only: it fixes nothing and writes nothing. There is nothing to repair in
the data — the rows are honest, it was the arithmetic over them that was wrong.

Run inside the backend container (needs SQLALCHEMY_DATABASE_URI set):
    python scripts/unpaid_trip_expenses.py
"""
from sqlalchemy import func, select

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import Expense, Payout


def main() -> None:
    # isnot(True) rather than is_(False): the trip properties walk the loaded
    # rows in Python, where a NULL is_deleted reads as live. Asking it the other
    # way here would report a live payout as missing and name trips whose
    # figures do not in fact move.
    paid = (
        select(func.coalesce(func.sum(Payout.amount), 0))
        .where(Payout.expense_uuid == Expense.uuid, Payout.is_deleted.isnot(True))
        .scalar_subquery()
    )

    with SqlAlchemyUnitOfWork() as uow:
        rows = uow.session.execute(
            select(
                Expense.uuid,
                Expense.trip_uuid,
                Expense.account_uuid,
                Expense.currency,
                Expense.amount,
                paid.label("paid"),
            )
            .where(
                Expense.trip_uuid.isnot(None),
                Expense.is_deleted.isnot(True),
                paid < Expense.amount,
            )
            .order_by(Expense.trip_uuid, Expense.created_at)
        ).all()

    if not rows:
        print("[unpaid] every live trip expense is fully covered by live payouts")
        return

    # per currency, never across: a trip can book USD and SYP costs, and one
    # total over both would be meaningless
    by_trip: dict[tuple[str, str], float] = {}
    print(f"[unpaid] {len(rows)} trip expense(s) not fully paid\n")
    for uuid_, trip_uuid, account_uuid, currency, amount, amount_paid in rows:
        outstanding = round(amount - amount_paid, 2)
        by_trip[(trip_uuid, currency)] = round(
            by_trip.get((trip_uuid, currency), 0) + outstanding, 2
        )
        print(
            f"  expense {uuid_}  trip {trip_uuid}  account {account_uuid}  "
            f"{currency}: booked {amount}, paid {amount_paid}, outstanding {outstanding}"
        )

    print("\n[unpaid] net_expected_cash rises by this much per trip and currency:")
    for (trip_uuid, currency), outstanding in sorted(by_trip.items()):
        print(f"  trip {trip_uuid}  {currency}: +{outstanding}")


if __name__ == "__main__":
    main()
