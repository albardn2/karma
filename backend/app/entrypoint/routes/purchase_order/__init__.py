# app/domains/hello/__init__.py
from flask import Blueprint

purchase_order_blueprint = Blueprint('purchase_order', __name__)

# Import routes so they are registered with the blueprint
from . import routes
