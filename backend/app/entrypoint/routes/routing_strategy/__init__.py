from flask import Blueprint

routing_strategy_blueprint = Blueprint('routing_strategy', __name__)

# Import routes so they are registered with the blueprint
from . import routes
