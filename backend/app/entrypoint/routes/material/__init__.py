# app/domains/hello/__init__.py
from flask import Blueprint

material_blueprint = Blueprint('material', __name__)

# Import routes so they are registered with the blueprint
from . import routes
