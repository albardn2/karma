# app/domains/hello/__init__.py
from flask import Blueprint

pricing_blueprint = Blueprint('pricing', __name__)

# Import routes so they are registered with the blueprint
from . import routes
