# app/domains/hello/__init__.py
from flask import Blueprint

payout_blueprint = Blueprint('payout', __name__)

# Import routes so they are registered with the blueprint
from . import routes
