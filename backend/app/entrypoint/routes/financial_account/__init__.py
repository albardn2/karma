# app/domains/hello/__init__.py
from flask import Blueprint

financial_account_blueprint = Blueprint('financial_account', __name__)

# Import routes so they are registered with the blueprint
from . import routes
