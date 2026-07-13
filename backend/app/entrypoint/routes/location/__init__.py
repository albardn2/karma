from flask import Blueprint

location_blueprint = Blueprint('location', __name__)

from app.entrypoint.routes.location import routes  # noqa: E402,F401
