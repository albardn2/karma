from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from pydantic import BaseModel
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError


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


def add_logged_user_to_payload(uow:SqlAlchemyUnitOfWork,user_uuid:str, payload:BaseModel):
    """
    Add the logged in user to the payload
    """
    current_user = uow.user_repository.find_one(uuid=user_uuid, is_deleted=False)
    if not current_user:
        raise NotFoundError("Current user not found")

    payload.created_by_uuid = user_uuid