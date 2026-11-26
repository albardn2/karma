"""Order money (currency, note-adjusted total, amount still due) for many orders
in one database round trip.

Reading `CustomerOrder.total_adjusted_amount` / `net_amount_due` off ORM objects
walks invoices -> items -> order items, debit and credit notes, payments and
payouts with a lazy load per hop: hundreds of thousands of queries, and every
row held in memory, for a dashboard over a few thousand orders. The hybrid
properties' SQL expressions avoid the round trips but run eleven correlated
subqueries per invoice, which takes tens of seconds at that size.

So each component is summed once per invoice, set-based, with the same rules
as the Invoice hybrids (keep them in step):
    total_adjusted = lines + debit notes - credit notes   (live lines only)
    paid           = payments - credit-note payouts + debit-note payments
    due            = total_adjusted - paid
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Query, Session

from models.common import (
    CreditNoteItem,
    CustomerOrder,
    CustomerOrderItem,
    DebitNoteItem,
    Invoice,
    InvoiceItem,
    Payment,
    Payout,
)


@dataclass(frozen=True)
class OrderAmounts:
    uuid: str
    created_at: datetime
    # the first live invoice's currency; None when the order has no live invoice
    currency: Optional[str]
    total_adjusted_amount: float
    net_amount_due: float


def order_amounts(session: Session, orders: Query) -> list[OrderAmounts]:
    """Money for every order `orders` selects (a query over CustomerOrder),
    oldest order first."""
    chosen = orders.with_entities(CustomerOrder.uuid.label("uuid"),
                                  CustomerOrder.created_at.label("created_at")).subquery("chosen")
    invoices = (
        select(Invoice.uuid, Invoice.customer_order_uuid, Invoice.currency, Invoice.created_at)
        .join(chosen, chosen.c.uuid == Invoice.customer_order_uuid)
        .where(Invoice.is_deleted.is_(False))
        .cte("invoices")
    )
    lines = (
        select(InvoiceItem.uuid, InvoiceItem.invoice_uuid, InvoiceItem.price_per_unit,
               InvoiceItem.customer_order_item_uuid)
        .join(invoices, invoices.c.uuid == InvoiceItem.invoice_uuid)
        .where(InvoiceItem.is_deleted.is_(False))
        .cte("lines")
    )
    parts = {
        "lines": _per_invoice(
            _summed(lines.c.invoice_uuid, lines.c.price_per_unit * CustomerOrderItem.quantity)
            .join(CustomerOrderItem, CustomerOrderItem.uuid == lines.c.customer_order_item_uuid),
            lines.c.invoice_uuid),
        "debit": _per_invoice(
            _summed(lines.c.invoice_uuid, DebitNoteItem.amount)
            .join(DebitNoteItem, DebitNoteItem.invoice_item_uuid == lines.c.uuid)
            .where(DebitNoteItem.is_deleted.is_(False)),
            lines.c.invoice_uuid),
        "credit": _per_invoice(
            _summed(lines.c.invoice_uuid, CreditNoteItem.amount)
            .join(CreditNoteItem, CreditNoteItem.invoice_item_uuid == lines.c.uuid)
            .where(CreditNoteItem.is_deleted.is_(False)),
            lines.c.invoice_uuid),
        "payments": _per_invoice(
            _summed(Payment.invoice_uuid, Payment.amount)
            .join(invoices, invoices.c.uuid == Payment.invoice_uuid)
            .where(Payment.is_deleted.is_(False)),
            Payment.invoice_uuid),
        "payouts": _per_invoice(
            _summed(lines.c.invoice_uuid, Payout.amount)
            .join(CreditNoteItem, CreditNoteItem.invoice_item_uuid == lines.c.uuid)
            .join(Payout, Payout.credit_note_item_uuid == CreditNoteItem.uuid)
            .where(CreditNoteItem.is_deleted.is_(False), Payout.is_deleted.is_(False)),
            lines.c.invoice_uuid),
        "debit_payments": _per_invoice(
            _summed(lines.c.invoice_uuid, Payment.amount)
            .join(DebitNoteItem, DebitNoteItem.invoice_item_uuid == lines.c.uuid)
            .join(Payment, Payment.debit_note_item_uuid == DebitNoteItem.uuid)
            .where(DebitNoteItem.is_deleted.is_(False), Payment.is_deleted.is_(False)),
            lines.c.invoice_uuid),
    }

    def amount(name: str):
        return func.coalesce(parts[name].c.amount, 0)

    total = amount("lines") + amount("debit") - amount("credit")
    paid = amount("payments") - amount("payouts") + amount("debit_payments")
    joined = chosen.outerjoin(invoices, invoices.c.customer_order_uuid == chosen.c.uuid)
    for part in parts.values():
        joined = joined.outerjoin(part, part.c.invoice_uuid == invoices.c.uuid)
    statement = (
        select(chosen.c.uuid, chosen.c.created_at, invoices.c.currency, total, total - paid)
        .select_from(joined)
        .order_by(chosen.c.created_at, chosen.c.uuid, invoices.c.created_at, invoices.c.uuid)
    )
    return _fold_by_order(session.execute(statement).all())


def _summed(invoice_uuid, amount):
    return select(invoice_uuid.label("invoice_uuid"), func.sum(amount).label("amount"))


def _per_invoice(statement, invoice_uuid):
    return statement.group_by(invoice_uuid).subquery()


def _fold_by_order(rows) -> list[OrderAmounts]:
    """Rows arrive grouped by order (one per live invoice, or a single all-NULL
    invoice row when there is none)."""
    out: list[OrderAmounts] = []
    current = None
    for uuid, created_at, currency, total, due in rows:
        if current is None or current["uuid"] != uuid:
            if current is not None:
                out.append(OrderAmounts(**current))
            current = {"uuid": uuid, "created_at": created_at, "currency": currency,
                       "total_adjusted_amount": 0.0, "net_amount_due": 0.0}
        current["total_adjusted_amount"] += total or 0.0
        current["net_amount_due"] += due or 0.0
    if current is not None:
        out.append(OrderAmounts(**current))
    return out
