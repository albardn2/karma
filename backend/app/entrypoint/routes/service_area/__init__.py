# app/domains/hello/__init__.py
from flask import Blueprint

service_area_blueprint = Blueprint('service_area', __name__)

# Import routes so they are registered with the blueprint
from . import routes
