# app/domains/hello/__init__.py
from flask import Blueprint

poi_blueprint = Blueprint('purchase_order_item', __name__)

# Import routes so they are registered with the blueprint
from . import routes
