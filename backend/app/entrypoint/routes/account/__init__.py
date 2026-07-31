from flask import Blueprint

account_blueprint = Blueprint('account', __name__)

from app.entrypoint.routes.account import routes  # noqa: E402,F401
