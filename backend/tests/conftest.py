import os, sys
from dotenv import load_dotenv, dotenv_values


load_dotenv()
# assume tests/ sits alongside app/
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)


import uuid
from datetime import datetime
import importlib
import pytest
from app.adapters.repositories._abstract_repo import Pagination


@pytest.fixture(autouse=True)
def return_dicts():
    return_single = {}
    return_all    = {}
    yield return_single, return_all
    # they’re re‑created fresh for each test

class DummyRepo:
    def __init__(self, name, return_single, return_all):
        self.name        = name
        self._single     = return_single
        self._all        = return_all
        self.saved_model = None

    def save(self, model, commit: bool = False):
        # mimic SQLAlchemy default assignment
        if not getattr(model, "uuid", None):
            model.uuid = str(uuid.uuid4())
        if not getattr(model, "created_at", None):
            model.created_at = datetime.utcnow()
        if hasattr(model, "is_deleted") and model.is_deleted is None:
            model.is_deleted = False

        self.saved_model = model

    def commit(self):
        # mimic SQLAlchemy’s commit
        pass

    def delete(self, model, commit: bool):
        # capture delete too
        self.saved_model = model

    def find_one(self, **kwargs):
        return self._single.get(self.name)

    def find_all(self, **kwargs):
        return self._all.get(self.name, [])

    def find_all_paginated(self, page: int, per_page: int, **kwargs):
        items = self._all.get(self.name, [])
        total = len(items)
        start = (page - 1) * per_page
        end   = start + per_page
        page_items = items[start:end]

        # use the real Pagination class
        return Pagination(
            items=page_items,
            total=total,
            page=page,
            per_page=per_page
        )

    def find_all_by_filters_paginated(self, filters=None, page: int = 1, per_page: int = 20, ordering=None):
        # we ignore filters/ordering in the dummy,
        # but still return a real Pagination
        return self.find_all_paginated(page, per_page)

class DummyUoW:
    """
    Context manager that hands out DummyRepo for each repo attribute.
    """
    last_instance = None

    def __init__(self, return_single, return_all):
        DummyUoW.last_instance = self
        # names must match what's used in your routes:
        self.customer_repository = DummyRepo("customer", return_single, return_all)
        self.material_repository = DummyRepo("material",  return_single, return_all)
        self.vendor_repository   = DummyRepo("vendor",    return_single, return_all)
        self.employee_repository = DummyRepo("employee",  return_single, return_all)
        self.expense_repository  = DummyRepo("expense",   return_single, return_all)
        self.pricing_repository  = DummyRepo("pricing",   return_single, return_all)
        self.purchase_order_repository = DummyRepo("purchase_order", return_single, return_all)
        self.purchase_order_item_repository = DummyRepo("purchase_order_item", return_single, return_all)
        self.financial_account_repository = DummyRepo("financial_account", return_single, return_all)
        self.warehouse_repository = DummyRepo("warehouse", return_single, return_all)
        self.fixed_asset_repository = DummyRepo("fixed_asset", return_single, return_all)
        self.transaction_repository = DummyRepo("transaction", return_single, return_all)
        self.customer_order_repository = DummyRepo("customer_order", return_single, return_all)
        self.customer_order_item_repository = DummyRepo("customer_order_item", return_single, return_all)
        self.invoice_repository = DummyRepo("invoice", return_single, return_all)
        self.invoice_item_repository = DummyRepo("invoice_item", return_single, return_all)
        self.payment_repository = DummyRepo("payment", return_single, return_all)
        self.payout_repository = DummyRepo("payout", return_single, return_all)
        self.inventory_repository = DummyRepo("inventory", return_single, return_all)
        self.inventory_event_repository = DummyRepo("inventory_event", return_single, return_all)
        self.debit_note_item_repository = DummyRepo("debit_note_item", return_single, return_all)
        self.credit_note_item_repository = DummyRepo("credit_note_item", return_single, return_all)
        # add more repositories here as you need them…

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def commit(self):
        # mimic SQLAlchemy’s commit
        pass

@pytest.fixture
def dummy_uow_class():
    """
    Provides the DummyUoW class so tests can grab .last_instance.
    """
    return DummyUoW

@pytest.fixture(autouse=True)
def patch_all_uows(monkeypatch, return_dicts):
    """
    Replace SqlAlchemyUnitOfWork in every routes module with our DummyUoW factory.
    """
    return_single, return_all = return_dicts

    def factory():
        return DummyUoW(return_single, return_all)

    for module_path in [
        "app.entrypoint.routes.customer.routes",
        "app.entrypoint.routes.material.routes",
        "app.entrypoint.routes.vendor.routes",
        "app.entrypoint.routes.employee.routes",
        "app.entrypoint.routes.expense.routes",
        "app.entrypoint.routes.pricing.routes",
        "app.entrypoint.routes.purchase_order.routes",
        "app.entrypoint.routes.purchase_order_item.routes",
        "app.entrypoint.routes.financial_account.routes",
        "app.entrypoint.routes.warehouse.routes",
        "app.entrypoint.routes.fixed_asset.routes",
        "app.entrypoint.routes.transaction.routes",
        "app.entrypoint.routes.customer_order.routes",
        "app.entrypoint.routes.customer_order_item.routes",
        "app.entrypoint.routes.invoice.routes",
        "app.entrypoint.routes.invoice_item.routes",
        "app.entrypoint.routes.payment.routes",
        "app.entrypoint.routes.payout.routes",
        "app.entrypoint.routes.inventory.routes",
        "app.entrypoint.routes.inventory_event.routes",
        "app.entrypoint.routes.debit_note.routes",
        "app.entrypoint.routes.credit_note.routes",
        # add any other route modules here…
    ]:
        mod = importlib.import_module(module_path)
        monkeypatch.setattr(mod, "SqlAlchemyUnitOfWork", factory)
    yield

@pytest.fixture
def app():
    """
    Create a Flask test app and register your blueprints.
    """
    from flask import Flask
    from app.entrypoint.routes.customer import customer_blueprint
    from app.entrypoint.routes.material import material_blueprint
    from app.entrypoint.routes.vendor import vendor_blueprint
    from app.entrypoint.routes.employee import employee_blueprint
    from app.entrypoint.routes.expense import expense_blueprint
    from app.entrypoint.routes.pricing import pricing_blueprint
    from app.entrypoint.routes.purchase_order import purchase_order_blueprint
    from app.entrypoint.routes.purchase_order_item import poi_blueprint
    from app.entrypoint.routes.financial_account import financial_account_blueprint
    from app.entrypoint.routes.warehouse import warehouse_blueprint
    from app.entrypoint.routes.fixed_asset import fixed_asset_blueprint
    from app.entrypoint.routes.transaction import transaction_blueprint
    from app.entrypoint.routes.customer_order import customer_order_blueprint
    from app.entrypoint.routes.customer_order_item import customer_order_item_blueprint
    from app.entrypoint.routes.invoice import invoice_blueprint
    from app.entrypoint.routes.invoice_item import invoice_item_blueprint
    from app.entrypoint.routes.payment import payment_blueprint
    from app.entrypoint.routes.payout import payout_blueprint
    from app.entrypoint.routes.inventory import inventory_blueprint
    from app.entrypoint.routes.inventory_event import inventory_event_blueprint
    from app.entrypoint.routes.debit_note import debit_note_item_blueprint
    from app.entrypoint.routes.credit_note import credit_note_item_blueprint

    app = Flask(__name__)
    app.config["TESTING"] = True

    app.register_blueprint(customer_blueprint, url_prefix="/customers")
    app.register_blueprint(material_blueprint,  url_prefix="/materials")
    app.register_blueprint(vendor_blueprint,    url_prefix="/vendor")
    app.register_blueprint(employee_blueprint,  url_prefix="/employee")
    app.register_blueprint(expense_blueprint,   url_prefix="/expense")
    app.register_blueprint(pricing_blueprint, url_prefix="/pricing")
    app.register_blueprint(purchase_order_blueprint, url_prefix="/purchase_order")
    app.register_blueprint(poi_blueprint, url_prefix="/purchase_order_item")
    app.register_blueprint(financial_account_blueprint, url_prefix="/financial_account")
    app.register_blueprint(warehouse_blueprint, url_prefix="/warehouse")
    app.register_blueprint(fixed_asset_blueprint, url_prefix="/fixed_asset")
    app.register_blueprint(transaction_blueprint, url_prefix="/transaction")
    app.register_blueprint(customer_order_blueprint, url_prefix="/customer_order")
    app.register_blueprint(customer_order_item_blueprint, url_prefix="/customer_order_item")
    app.register_blueprint(invoice_blueprint, url_prefix="/invoice")
    app.register_blueprint(invoice_item_blueprint, url_prefix="/invoice_item")
    app.register_blueprint(payment_blueprint, url_prefix="/payment")
    app.register_blueprint(payout_blueprint, url_prefix="/payout")
    app.register_blueprint(inventory_blueprint, url_prefix="/inventory")
    app.register_blueprint(inventory_event_blueprint, url_prefix="/inventory_event")
    app.register_blueprint(debit_note_item_blueprint, url_prefix="/debit_note_item")
    app.register_blueprint(credit_note_item_blueprint, url_prefix="/credit_note_item")



    return app

@pytest.fixture
def client(app):
    return app.test_client()
