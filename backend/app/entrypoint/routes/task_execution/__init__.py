# app/domains/hello/__init__.py
from flask import Blueprint

task_execution_blueprint = Blueprint('task_execution', __name__)

# Import routes so they are registered with the blueprint
from . import routes
