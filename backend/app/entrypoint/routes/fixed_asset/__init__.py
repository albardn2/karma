# app/domains/hello/__init__.py
from flask import Blueprint

fixed_asset_blueprint = Blueprint('fixed_asset', __name__)

# Import routes so they are registered with the blueprint
from . import routes
