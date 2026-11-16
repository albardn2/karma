"""Who a payment came from, carried on the payment itself (QA SAL-P-3).

The payer is two hops away (invoice → order → customer, or debit note → customer), so
without a name on the payment the list shows hundreds of identical rows. A company
name wins over a person's name, as on the payment's own detail screen.
"""
import pytest

from models.common import Customer, CustomerOrder, DebitNoteItem, Invoice, Payment

COMPANY = "QA-Sales Shop"
PERSON = "Abu Mohammad"


def _customer(company=COMPANY, person=PERSON) -> Customer:
    return Customer(full_name=person, company_name=company)


def test_invoice_payment_is_named_after_the_customer_company():
    order = CustomerOrder(customer=_customer())
    payment = Payment(invoice=Invoice(customer_order=order))

    assert payment.payer_name == COMPANY, payment.payer_name


def test_person_name_is_used_when_there_is_no_company():
    order = CustomerOrder(customer=_customer(company=None))
    payment = Payment(invoice=Invoice(customer_order=order))

    assert payment.payer_name == PERSON, payment.payer_name


def test_debit_note_payment_is_named_after_its_customer():
    payment = Payment(debit_note_item=DebitNoteItem(customer=_customer()))

    assert payment.payer_name == COMPANY, payment.payer_name


@pytest.mark.parametrize("payment", [Payment(), Payment(invoice=Invoice())])
def test_payment_without_a_resolvable_customer_has_no_payer_name(payment):
    assert payment.payer_name is None, payment.payer_name
