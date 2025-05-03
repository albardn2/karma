from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def scopes_required(*required_scopes: str):
    """
    Decorator factory: pass in one or more scope strings.
    The endpoint is allowed if *any* scope in `required_scopes`
    appears in the JWT’s "scopes" claim.
    """
    def wrapper(fn):
        @wraps(fn)
        def decorated(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user_scopes = set(claims.get("scopes", []))
            # If there's any overlap, we're good
            if not user_scopes.intersection(required_scopes):
                return jsonify({"msg": "Forbidden — missing required scope"}), 403
            return fn(*args, **kwargs)
        return decorated
    return wrapper