from flask import Blueprint

process_template_blueprint = Blueprint('process_template', __name__)

# Import routes so they are registered with the blueprint
from . import routes
