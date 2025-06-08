# app/domains/hello/__init__.py
from flask import Blueprint

expense_blueprint = Blueprint('expense', __name__)

# Import routes so they are registered with the blueprint
from . import routes
