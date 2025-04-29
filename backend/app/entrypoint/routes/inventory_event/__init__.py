# app/domains/hello/__init__.py
from flask import Blueprint

inventory_event_blueprint = Blueprint('inventory_event', __name__)

# Import routes so they are registered with the blueprint
from . import routes
