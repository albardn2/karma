# app/domains/hello/__init__.py
from flask import Blueprint

customer_order_item_blueprint = Blueprint('customer_order_item', __name__)

# Import routes so they are registered with the blueprint
from . import routes
