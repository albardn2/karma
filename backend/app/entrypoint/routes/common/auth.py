from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from pydantic import BaseModel
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError


_ADMIN_SCOPES = {"admin", "superuser"}


def scopes_required(*required_scopes: str):
    """
    Decorator factory: pass in one or more scope strings.
    The endpoint is allowed if *any* scope in `required_scopes`
    appears in the JWT’s "scopes" claim.

    Users carrying a fine-grained permissions object (g.user_acl, loaded by
    the before_request chokepoint which already enforced their per-endpoint
    CRUD grant) bypass the role check — their checklist is authoritative —
    EXCEPT on admin-only routes, which stay admin-only.
    """
    def wrapper(fn):
        @wraps(fn)
        def decorated(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user_scopes = set(claims.get("scopes", []))
            required = set(required_scopes)
            # platform-owner routes: ONLY superuser may pass — the tenant-admin
            # bypass below must not open the super-admin console to tenants
            if required == {"superuser"}:
                if "superuser" in user_scopes:
                    return fn(*args, **kwargs)
                return jsonify({"msg": "Forbidden — platform owner only"}), 403
            if user_scopes.intersection(_ADMIN_SCOPES):
                return fn(*args, **kwargs)

            from flask import g
            if getattr(g, "user_acl", None) is not None:
                # fine-grained user (explicit checklist OR role preset): the
                # endpoint grant is already enforced in before_request, which
                # is the source of truth. Only admin-only routes stay locked.
                if set(required_scopes) <= _ADMIN_SCOPES:
                    return jsonify({"msg": "Forbidden — admins only"}), 403
                return fn(*args, **kwargs)

            # no effective perms at all (shouldn't happen for a valid user):
            # fall back to the role-overlap check
            if not user_scopes.intersection(required_scopes):
                return jsonify({"msg": "Forbidden — missing required scope"}), 403
            return fn(*args, **kwargs)
        # record the required scopes so role presets can be derived from the
        # actual route decorators (see scripts/gen_role_presets.py)
        decorated._required_scopes = tuple(required_scopes)
        return decorated
    return wrapper


def add_logged_user_to_payload(uow:SqlAlchemyUnitOfWork,user_uuid:str, payload:BaseModel):
    """
    Add the logged in user to the payload
    """
    # unscoped self-lookup: user_uuid comes from the verified JWT, and during
    # impersonation the superuser's row lives outside the tenant scope
    from models.common import User as UserModel
    current_user = uow.session.query(UserModel).filter_by(
        uuid=user_uuid, is_deleted=False).one_or_none()
    if not current_user:
        raise NotFoundError("Current user not found")

    payload.created_by_uuid = user_uuid