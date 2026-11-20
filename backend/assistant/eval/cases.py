"""Eval questions with ground truth computed straight from the API.

Each case's `truth(ex)` uses the same tool layer the model uses (as the same
user), so the expected answer reflects the data at the moment the eval runs.
Grading is deliberately simple and strict: the answer must contain every
expected number (within tolerance) and every expected name.

These are a starting set. Replace/extend them with the real questions your
users ask — those become the eval that decides which model to enable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .. import query_data as qd


@dataclass
class Expect:
    numbers: list[float] = field(default_factory=list)
    names: list[str] = field(default_factory=list)


@dataclass
class Case:
    id: str
    question: str
    truth: Callable[[object], Expect]
    tags: tuple = ()


def _q(ex, **kw):
    return qd.run(ex, kw)


def _count(ex, endpoint, where=None, params=None):
    return _q(ex, endpoint=endpoint, params=params or {}, where=where or [], aggregates=[{"op": "count"}])["result"][0]["count"]


def _customer_name(row):
    return (row.get("company_name") or row.get("full_name") or "").strip()


def top_debtors(ex, currency, n):
    out = _q(ex, endpoint="customer__list_customers",
             where=[{"field": f"balance_per_currency.{currency}", "op": "gt", "value": 0}],
             sort=[{"field": f"balance_per_currency.{currency}", "desc": True}], limit=n,
             fields=["company_name", "full_name", f"balance_per_currency.{currency}"])
    return out["result"]


UNPAID = ["pending", "partially_paid"]

CASES: list[Case] = [
    Case("count_customers", "How many customers do we have?",
         lambda ex: Expect(numbers=[_count(ex, "customer__list_customers")]), ("lookup",)),
    Case("count_materials", "How many materials/products are in the catalogue?",
         lambda ex: Expect(numbers=[_count(ex, "material__list_materials")]), ("lookup",)),
    Case("top3_usd_debtors", "Who are the top 3 customers by how much they owe us in USD?",
         lambda ex: Expect(names=[_customer_name(r) for r in top_debtors(ex, "USD", 3)]), ("analysis", "money")),
    Case("top_syp_debtor_amount", "Which customer owes us the most in Syrian pounds, and how much?",
         lambda ex: (lambda r: Expect(names=[_customer_name(r)], numbers=[r["balance_per_currency.SYP"]]))(
             top_debtors(ex, "SYP", 1)[0]), ("analysis", "money")),
    Case("unpaid_usd_total", "What is the total unpaid amount on USD invoices?",
         lambda ex: Expect(numbers=[round(sum(
             r["net_amount_due"] for r in qd.fetch_all(ex, "invoice__list_invoices", {})
             if r["currency"] == "USD" and r["status"] in UNPAID), 2)]), ("analysis", "money")),
    Case("unpaid_syp_count_ar", "كم عدد الفواتير غير المدفوعة بالليرة السورية؟",
         lambda ex: Expect(numbers=[_count(ex, "invoice__list_invoices",
                                           [{"field": "currency", "op": "eq", "value": "SYP"},
                                            {"field": "status", "op": "in", "value": UNPAID}])]), ("analysis", "arabic")),
    Case("overdue_invoices", "How many invoices are overdue right now?",
         lambda ex: Expect(numbers=[_count(ex, "invoice__list_invoices",
                                           [{"field": "is_overdue", "op": "eq", "value": True}])]), ("lookup",)),
    Case("repeat_customers", "How many customers are tagged as repeat buyers (customer_sale:repeated_sale)?",
         lambda ex: Expect(numbers=[_count(ex, "customer__list_customers",
                                           [{"field": "tags", "op": "contains",
                                             "value": "customer_sale:repeated_sale"}])]), ("analysis",)),
    Case("trips_completed", "How many trips have been completed so far?",
         lambda ex: Expect(numbers=[_count(ex, "trip__list_trips",
                                           [{"field": "status", "op": "eq", "value": "completed"}])]), ("lookup", "trips")),
    Case("payments_last_7d", "How many payments were recorded in the last 7 days?",
         lambda ex: Expect(numbers=[_count(ex, "payment__list_payments",
                                           [{"field": "created_at", "op": "gte", "value": "now-7d"}])]), ("analysis", "dates")),
    Case("usd_collected_total", "How much money have we collected in USD in total, across all payments?",
         lambda ex: Expect(numbers=[round(sum(
             r["amount"] for r in qd.fetch_all(ex, "payment__list_payments", {}) if r["currency"] == "USD"), 2)]),
         ("analysis", "money")),
    Case("busiest_driver_ar", "من هو السائق أو المندوب الذي لديه أكبر عدد من الرحلات المكتملة؟",
         lambda ex: Expect(names=[_q(ex, endpoint="trip__list_trips",
                                     where=[{"field": "status", "op": "eq", "value": "completed"}],
                                     group_by=["assigned_username"], aggregates=[{"op": "count"}],
                                     sort=[{"field": "count", "desc": True}], limit=1)["result"][0]["assigned_username"]]),
         ("analysis", "arabic", "trips")),
]
