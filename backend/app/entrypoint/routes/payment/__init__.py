# app/domains/hello/__init__.py
from flask import Blueprint

payment_blueprint = Blueprint('payment', __name__)

# Import routes so they are registered with the blueprint
from . import routes
