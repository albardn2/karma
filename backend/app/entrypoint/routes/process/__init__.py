# app/domains/hello/__init__.py
from flask import Blueprint

process_blueprint = Blueprint('process', __name__)

# Import routes so they are registered with the blueprint
from . import routes
