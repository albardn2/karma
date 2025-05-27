# app/domains/hello/__init__.py
from flask import Blueprint

workflow_execution_blueprint = Blueprint('workflow_execution', __name__)

# Import routes so they are registered with the blueprint
from . import routes
