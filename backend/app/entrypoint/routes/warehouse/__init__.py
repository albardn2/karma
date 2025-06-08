# app/domains/hello/__init__.py
from flask import Blueprint

warehouse_blueprint = Blueprint('warehouse', __name__)

# Import routes so they are registered with the blueprint
from . import routes
