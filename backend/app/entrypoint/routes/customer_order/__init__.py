# app/domains/hello/__init__.py
from flask import Blueprint

customer_order_blueprint = Blueprint('customer_order', __name__)

# Import routes so they are registered with the blueprint
from . import routes
