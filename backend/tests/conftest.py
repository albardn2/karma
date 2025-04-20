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

    def save(self, model, commit: bool):
        # mimic SQLAlchemy default assignment
        if not getattr(model, "uuid", None):
            model.uuid = str(uuid.uuid4())
        if not getattr(model, "created_at", None):
            model.created_at = datetime.utcnow()
        if hasattr(model, "is_deleted") and model.is_deleted is None:
            model.is_deleted = False

        self.saved_model = model

    def delete(self, model, commit: bool):
        # capture delete too
        self.saved_model = model

    def find_one(self, **kwargs):
        return self._single.get(self.name)

    def find_all(self, **kwargs):
        return self._all.get(self.name, [])

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
        # add more repositories here as you need them…

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
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

    app = Flask(__name__)
    app.config["TESTING"] = True

    app.register_blueprint(customer_blueprint, url_prefix="/customers")
    app.register_blueprint(material_blueprint,  url_prefix="/materials")
    app.register_blueprint(vendor_blueprint,    url_prefix="/vendor")
    app.register_blueprint(employee_blueprint,  url_prefix="/employee")
    app.register_blueprint(expense_blueprint,   url_prefix="/expense")
    # register other blueprints here…

    return app

@pytest.fixture
def client(app):
    return app.test_client()
