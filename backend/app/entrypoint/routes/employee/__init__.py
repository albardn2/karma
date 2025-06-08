# app/domains/hello/__init__.py
from flask import Blueprint

employee_blueprint = Blueprint('employee', __name__)

# Import routes so they are registered with the blueprint
from . import routes
