# app/domains/hello/__init__.py
from flask import Blueprint

vendor_blueprint = Blueprint('vendor', __name__)

# Import routes so they are registered with the blueprint
from . import routes
