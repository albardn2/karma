from flask import Blueprint

dashboard_blueprint = Blueprint('dashboard', __name__)

# Import routes so they are registered with the blueprint
from . import routes
