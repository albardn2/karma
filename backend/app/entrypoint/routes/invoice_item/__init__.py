# app/domains/hello/__init__.py
from flask import Blueprint

invoice_item_blueprint = Blueprint('invoice_item', __name__)

# Import routes so they are registered with the blueprint
from . import routes
