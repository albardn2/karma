# app/domains/hello/__init__.py
from flask import Blueprint

quality_control_blueprint = Blueprint('quality_control', __name__)

# Import routes so they are registered with the blueprint
from . import routes
