from flask import Blueprint

super_admin_blueprint = Blueprint('super_admin', __name__)

from app.entrypoint.routes.super_admin import routes  # noqa: E402,F401
from app.entrypoint.routes.super_admin import assistant  # noqa: E402,F401
