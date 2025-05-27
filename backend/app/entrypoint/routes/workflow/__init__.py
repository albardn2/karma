# app/domains/hello/__init__.py
from flask import Blueprint

workflow_blueprint = Blueprint('workflow', __name__)

# Import routes so they are registered with the blueprint
from . import routes
