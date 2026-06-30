from flask import Blueprint

vehicle_inventory_event_blueprint = Blueprint('vehicle_inventory_event', __name__)

# Import routes so they are registered with the blueprint
from . import routes
