# app/domains/hello/__init__.py
from flask import Blueprint

trip_stop_blueprint = Blueprint('trip_stop', __name__)

# Import routes so they are registered with the blueprint
from . import routes
