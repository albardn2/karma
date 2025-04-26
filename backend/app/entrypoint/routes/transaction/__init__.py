# app/domains/hello/__init__.py
from flask import Blueprint

transaction_blueprint = Blueprint('transaction', __name__)

# Import routes so they are registered with the blueprint
from . import routes
