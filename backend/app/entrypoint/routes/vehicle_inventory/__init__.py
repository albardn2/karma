from flask import Blueprint

vehicle_inventory_blueprint = Blueprint('vehicle_inventory', __name__)

# Import routes so they are registered with the blueprint
from . import routes
