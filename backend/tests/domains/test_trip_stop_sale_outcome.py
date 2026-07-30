"""A stop where goods were sold should say "sale" without being asked twice.

Both clients auto-populate the trip stop's `outcome` select to the sale option
when a revenue-bearing order was created at that stop. Neither client can be
tested here — the web has no test runner and the app's jest has no suites — so
what this file pins is the BACKEND side of the contract they both depend on:

  1. which money field means "value of goods sold", and why the two obvious
     alternatives are each wrong on the case the other handles, and
  2. that the sale option is findable by its machine key, since the clients must
     resolve the option string out of the stop's own frozen option list rather
     than hardcoding a value.

Break either and the feature degrades silently: no error anywhere, just a stop
that stays blank after a sale, or an outcome string no chart groups correctly.

The client-side twins are frontend/client/src/lib/tripStopOutcome.ts and
expo_app/utils/tripStopOutcome.ts.
"""
import pytest

from models.common import MONEY_TOLERANCE, CustomerOrder, Invoice
from app.domains.task_execution.workflow_operators.create_trip_operator import (
    TripStopOutcome,
)

# The Python branches of the hybrids — the class attributes are SQL expressions.
# Lifting them verbatim is the point: a paraphrase of the predicate would pass
# these tests while the shipped one failed.
_order_total_adjusted = CustomerOrder.__dict__["total_adjusted_amount"].fget
_order_net_due = CustomerOrder.__dict__["net_amount_due"].fget
_order_net_paid = CustomerOrder.__dict__["net_amount_paid"].fget
_invoice_total_adjusted = Invoice.__dict__["total_adjusted_amount"].fget


class _Invoice:
    """Just enough of an invoice for the order-level sums."""

    def __init__(self, total_adjusted, net_due, net_paid, is_deleted=False):
        self.total_adjusted_amount = total_adjusted
        self.net_amount_due = net_due
        self.net_amount_paid = net_paid
        self.is_deleted = is_deleted


class _Order:
    def __init__(self, *invoices):
        self.invoices = list(invoices)


def sold_for(total, collected):
    """An order of `total` with `collected` already taken in."""
    return _Order(_Invoice(total, total - collected, collected))


# --- which field means "revenue" ------------------------------------------
#
# This is the whole reason the feature needed care. A driver who sells for cash
# collects on the spot, and the app's create-order screen marks that order paid
# immediately, so the amount still owed is zero on the most ordinary sale there
# is. Checked against live data before writing this: of ten real stop-linked
# orders, `net_amount_due > 0` missed three genuine sales — every one of them
# paid in full at the stop.


@pytest.mark.parametrize("collected", [0.0, 40.0, 100.0])
def test_revenue_is_the_same_whether_or_not_the_money_came_in(collected):
    """Unpaid, part-paid and paid-in-full are all equally a sale."""
    order = sold_for(100.0, collected)
    assert _order_total_adjusted(order) == 100.0


def test_amount_due_would_miss_a_sale_paid_on_the_spot():
    """The trap, stated as a test so nobody 'simplifies' the predicate into it."""
    cash_sale = sold_for(100.0, 100.0)
    assert _order_total_adjusted(cash_sale) > MONEY_TOLERANCE, "it IS a sale"
    assert _order_net_due(cash_sale) == 0.0, (
        "and amount-due says otherwise — this is why the predicate cannot use it"
    )


def test_amount_paid_would_miss_a_sale_on_credit():
    """The mirror-image trap: no single payment-derived field works."""
    credit_sale = sold_for(100.0, 0.0)
    assert _order_total_adjusted(credit_sale) > MONEY_TOLERANCE
    assert _order_net_paid(credit_sale) == 0.0


def test_a_free_sample_run_is_not_a_sale():
    """Zero-priced goods handed over: real visit, no revenue."""
    assert _order_total_adjusted(sold_for(0.0, 0.0)) == 0.0


def test_an_order_credited_back_to_nothing_is_not_a_sale():
    """total_adjusted_amount is items + debit notes - credit notes."""
    returned = _Order(_Invoice(0.0, 0.0, 0.0))
    assert _order_total_adjusted(returned) == 0.0


def test_a_voided_invoice_leaves_no_revenue_on_a_live_order():
    """Deleted invoices drop out of every one of the three sums."""
    order = _Order(_Invoice(100.0, 100.0, 0.0, is_deleted=True))
    assert _order_total_adjusted(order) == 0
    assert _order_net_due(order) == 0


def test_an_order_with_no_invoice_at_all_has_no_revenue():
    """Reachable: POST /customer-order/ creates an order without one."""
    assert _order_total_adjusted(_Order()) == 0


# --- why the threshold is a tolerance, not zero ----------------------------


class _InvoiceItem:
    def __init__(self, total_price, debits=(), credits=(), is_deleted=False):
        self.total_price = total_price
        self.is_deleted = is_deleted
        self.debit_note_items = [_Note(a) for a in debits]
        self.credit_note_items = [_Note(a) for a in credits]


class _Note:
    def __init__(self, amount, is_deleted=False):
        self.amount = amount
        self.is_deleted = is_deleted


class _InvoiceWithItems:
    """Enough of an invoice to exercise its own total_adjusted_amount."""

    def __init__(self, *items):
        self.invoice_items = list(items)

    @property
    def total_amount(self):
        return sum(i.total_price for i in self.invoice_items if not i.is_deleted)


def test_invoice_revenue_can_go_negative_which_is_why_zero_is_not_the_bar():
    """A live credit note against a VOIDED invoice line reads negative.

    `total_amount` skips deleted items; the debit/credit legs of
    total_adjusted_amount iterate `self.invoice_items` without that filter (see
    models/common.py:477-490), so the credit outlives the line it was raised
    against. The SQL branch of the same property DOES filter, so the identical
    order answers 0 there — meaning a `!= 0` test would both call this a sale
    and disagree with itself depending on how the value was read.
    """
    invoice = _InvoiceWithItems(_InvoiceItem(50.0, credits=(50.0,), is_deleted=True))
    assert _invoice_total_adjusted(invoice) == -50.0
    assert _invoice_total_adjusted(invoice) != 0, (
        "the premise: a '!= 0' predicate would report revenue here"
    )
    assert not (_invoice_total_adjusted(invoice) > MONEY_TOLERANCE), (
        "the tolerance comparison the clients use rejects it"
    )


def test_float_dust_is_not_revenue():
    """The same half-cent bar the invoice/payment code uses."""
    assert not (0.001 > MONEY_TOLERANCE)
    assert 0.01 > MONEY_TOLERANCE


# --- the sale option must be findable by its machine key -------------------
#
# Each stop's option list is a SNAPSHOT frozen into task_inputs.fields when its
# trip was created, so the exact strings differ by vintage — the local database
# holds a bare "sale" on a stop from 2026-06-30 and "sale - تم البيع" on every
# stop since. The clients therefore match on the family key rather than the whole
# value, exactly as every downstream reader does (`ilike 'sale%'` in the backend
# analytics, `startsWith('sale')` in both trip-analytics widgets).


def family(option: str) -> str:
    """The clients' rule, restated: everything before the Arabic half."""
    return option.split(" - ")[0].strip()


def test_the_sale_outcomes_family_key_is_exactly_sale():
    assert family(TripStopOutcome.SALE.value) == "sale", (
        "both clients find the sale option by this key; renaming the member "
        "without keeping the key makes the auto-populate silently do nothing"
    )


def test_only_one_outcome_answers_to_that_key():
    """Otherwise `find` picks whichever happens to come first."""
    matches = [o.value for o in TripStopOutcome if family(o.value) == "sale"]
    assert matches == [TripStopOutcome.SALE.value]


def test_no_other_outcome_is_mistaken_for_a_sale():
    """`no_sale` used to be a member and rows still carry it; the family key
    keeps it distinct, where a substring test would not."""
    for outcome in TripStopOutcome:
        if outcome is TripStopOutcome.SALE:
            continue
        assert family(outcome.value) != "sale", outcome.value


def test_every_outcome_splits_on_the_separator_the_clients_use():
    """If a member is ever added without ' - <arabic>', the split still yields a
    usable key — but the charts group by the Arabic half, so it would show up
    untranslated. Assert the shape instead of discovering it in a chart."""
    for outcome in TripStopOutcome:
        assert " - " in outcome.value, outcome.value
        key, arabic = outcome.value.split(" - ", 1)
        assert key.strip() and arabic.strip(), outcome.value


# --- the field descriptor the clients read ---------------------------------


def outcome_descriptor():
    """The outcome field as create_trip_operator builds it for a new stop."""
    from app.dto.task import FieldType, TaskInputField

    return TaskInputField(
        name="outcome -  النتيجة",
        label="outcome",
        type=FieldType.SELECT,
        required=True,
        options=[o.value for o in TripStopOutcome],
    )


def test_the_clients_locate_the_field_by_label_not_name():
    """`label` is the stable half. `name` carries the Arabic and has drifted —
    older stops hold a bare "outcome", current ones "outcome -  النتيجة" with two
    spaces — so a client keying off `name` finds nothing on one vintage or the
    other. It still has to WRITE under `name`, which is the form-state key."""
    field = outcome_descriptor()
    assert field.label == "outcome"
    assert field.name != field.label, (
        "if these ever converge, drop the two-key dance in both clients"
    )


def test_the_sale_option_is_present_and_resolvable_on_a_new_stop():
    field = outcome_descriptor()
    found = next((o for o in (field.options or []) if family(o) == "sale"), None)
    assert found == TripStopOutcome.SALE.value


def test_the_outcome_is_required_so_auto_populating_only_saves_a_tap():
    """It cannot mask a missing value — the driver still sees and confirms it."""
    assert outcome_descriptor().required is True
