from flask import Blueprint

# The blueprint NAME is the ACL endpoint key (see permissions.py RESOURCES) —
# it is what before_request checks, not the url_prefix. Renaming this without
# updating RESOURCES silently disables the permission check for this resource.
exchange_rate_blueprint = Blueprint('exchange_rate', __name__)

# Import routes so they are registered with the blueprint
from . import routes
