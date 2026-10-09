"""Loader chains that more than one list route needs.

Nothing in models/common.py sets `lazy=` on its 122 relationships, so every
hop a DTO's derived fields walk is a separate query per parent row. Each
list route pins its own chains next to its repository; the two chains below
live here instead because three and two routes respectively walk the SAME
properties, and a chain that is copied is a chain that drifts.

They are ROOTED, not absolute: compose them under a parent with
`selectinload(Parent.child).options(*CHAIN)`.
"""
from sqlalchemy.orm import selectinload

from models.common import (
    CreditNoteItem,
    DebitNoteItem,
    Invoice,
    InvoiceItem,
    PurchaseOrderItem,
)


# Everything Invoice's money properties walk, rooted at Invoice:
#   total_adjusted_amount (569) -> invoice_items (572)
#                                    -> debit_note_items (573)
#                                    -> credit_note_items (579)
#   total_amount (550)          -> invoice_items (553), whose total_price
#                                  (770) -> quantity (758) ->
#                                  customer_order_item
#   net_amount_paid (611)       -> payments (614)
#                               -> invoice_items -> credit_note_items ->
#                                  payouts (621)
#                               -> invoice_items -> debit_note_items ->
#                                  payments (628)
# net_amount_due (673), is_paid (685), status (694) and is_overdue (713) add
# no hop of their own; they are arithmetic over the four above.
#
# The two deepest legs fire ZERO queries on the current database — the note
# tables are empty, and selectinload skips a level whose parents came back
# empty. They are in this list because they are in the CODE, not because they
# were observed: the first tenant to issue a credit note would otherwise
# reintroduce the N+1 on the one leg nobody measured.
#
# Used by /invoice/ (rooted directly), /customer-order/ (under
# CustomerOrder.invoices) and /customer/ (under Customer.orders ->
# CustomerOrder.invoices).
#
# selectinload throughout, never joinedload: a JOIN would multiply each parent
# row by its invoice items and LIMIT 20 would then return 20 ROWS rather than
# 20 records — the wrong page, silently.
INVOICE_MONEY_LOADERS = [
    selectinload(Invoice.payments),
    selectinload(Invoice.invoice_items).selectinload(InvoiceItem.customer_order_item),
    selectinload(Invoice.invoice_items)
    .selectinload(InvoiceItem.debit_note_items)
    .selectinload(DebitNoteItem.payments),
    selectinload(Invoice.invoice_items)
    .selectinload(InvoiceItem.credit_note_items)
    .selectinload(CreditNoteItem.payouts),
]


# PurchaseOrderItem.adjusted_price_per_unit (1335) -> adjusted_quantity
# (1274/1277) + adjusted_total_price (1306/1309) -> debit_note_items +
# credit_note_items. Two queries per ITEM, not per order, and nothing on
# either page shows those notes — they only move the adjusted totals.
#
# Used by /purchase-order/ (under PurchaseOrder.purchase_order_items) and
# /inventory/ (under Inventory.inventory_events ->
# InventoryEvent.purchase_order_item).
PURCHASE_ORDER_ITEM_NOTE_LOADERS = [
    selectinload(PurchaseOrderItem.debit_note_items),
    selectinload(PurchaseOrderItem.credit_note_items),
]
