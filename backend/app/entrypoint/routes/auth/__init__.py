# app/domains/hello/__init__.py
from flask import Blueprint

auth_blueprint = Blueprint('auth', __name__)

# Import routes so they are registered with the blueprint
from . import routes
