# app/domains/hello/__init__.py
from flask import Blueprint

financials_blueprint = Blueprint('financials', __name__)

# Import routes so they are registered with the blueprint
from . import routes
