from datetime import timedelta

from flask import Blueprint, request, jsonify
from werkzeug.exceptions import Unauthorized, Conflict
from flask_jwt_extended import (
    create_access_token,
    set_access_cookies,
    unset_jwt_cookies,
    jwt_required,
    get_jwt_identity, create_refresh_token, set_refresh_cookies, get_jwt
)
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.auth import (
    RegisterRequest,
    SignupRequest,
    LoginRequest,
    TokenResponse,
    UserRead
)
from models.common import User as UserModel
from app.entrypoint.routes.auth import auth_blueprint
from app.entrypoint.routes.common.errors import BadRequestError
from app.entrypoint.routes.common.auth import scopes_required
from app.dto.auth import UserUpdate
from app.domains.user.domain import UserDomain
from app.dto.auth import UserListParams

from app.dto.auth import UserPage
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.dto.auth import PermissionScope


@auth_blueprint.route("/register", methods=["POST"])
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def register():
    payload = RegisterRequest(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        user_read = UserDomain.create_user(uow=uow, payload=payload)
        result = user_read.model_dump(mode="json")
        uow.commit()
    return jsonify(result), 201

@auth_blueprint.route("/permission-catalog", methods=["GET"])
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def permission_catalog():
    """The checklists an admin can grant: menu modules + per-resource CRUD,
    plus each role's preset so the UI can apply a role as a shortcut."""
    from app.entrypoint.routes.common.permissions import (
        MODULES, RESOURCES, ACTIONS, ROLE_PRESETS,
    )
    return jsonify({
        "modules": MODULES,
        "resources": RESOURCES,
        "actions": ACTIONS,
        "role_presets": ROLE_PRESETS,
    }), 200


@auth_blueprint.route("/signup", methods=["POST"])
def signup():
    """Public signup: create a company (account) + its first admin user,
    then sign them in (same token/cookie shape as /auth/login)."""
    payload = SignupRequest(**request.json)
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        user = UserDomain.signup(uow=uow, payload=payload)
        scopes = user.permission_scope.split(",")
        access_token = create_access_token(
            identity=user.uuid,
            additional_claims={"scopes": scopes, "account_uuid": user.account_uuid},
            expires_delta=timedelta(days=1)
        )
        refresh_token = create_refresh_token(
            identity=user.uuid,
            expires_delta=timedelta(days=14)
        )
        uow.commit()
    resp = jsonify(TokenResponse(access_token=access_token,
                                 refresh_token=refresh_token).model_dump(mode="json"))
    set_access_cookies(resp, access_token)
    set_refresh_cookies(resp, refresh_token)
    return resp, 201


@auth_blueprint.route("/login", methods=["POST"])
def login():
    req = LoginRequest(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        user = None
        if req.username_or_email:
            user = uow.user_repository.find_one(username=req.username_or_email, is_deleted=False)
            if not user:
                user = uow.user_repository.find_one(email=req.username_or_email, is_deleted=False)

            if not user or not user.verify_password(req.password):
                raise Unauthorized("Bad credentials")
        elif req.rfid_token:
            user = uow.user_repository.find_one(rfid_token=req.rfid_token, is_deleted=False)
            if not user:
                raise Unauthorized("RFID token not found or invalid")
        else:
            raise BadRequestError("username_or_email or rfid_token must be provided")

        scopes = user.permission_scope.split(",")  # e.g. "read,write,admin"
        access_token = create_access_token(
            identity=user.uuid,
            additional_claims={"scopes": scopes, "account_uuid": user.account_uuid},
            expires_delta=timedelta(days=1)
        )
        # 14-day refresh token
        refresh_token = create_refresh_token(
            identity=user.uuid,
            expires_delta=timedelta(days=14)
        )
        resp = jsonify(TokenResponse(access_token=access_token,
                                     refresh_token=refresh_token).model_dump(mode="json"))
        # also set it as a secure cookie
        set_access_cookies(resp, access_token)
        set_refresh_cookies(resp, refresh_token)
        return resp, 200

@auth_blueprint.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Exchange a valid refresh token (header or cookie) for a new access
    token, re-reading the user's scopes so permission changes take effect."""
    current_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        user = uow.user_repository.find_one(uuid=current_uuid, is_deleted=False)
        if not user:
            raise Unauthorized("User not found")
        scopes = user.permission_scope.split(",")
        access_token = create_access_token(
            identity=user.uuid,
            additional_claims={"scopes": scopes, "account_uuid": user.account_uuid},
            expires_delta=timedelta(days=1)
        )
    resp = jsonify({"access_token": access_token})
    set_access_cookies(resp, access_token)
    return resp, 200

@auth_blueprint.route("/logout", methods=["POST"])
def logout():
    resp = jsonify({"msg": "Logged out"})
    unset_jwt_cookies(resp)
    return resp, 200

@auth_blueprint.route("/user/<string:user_uuid>", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def profile(user_uuid: str):
    current_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        user = uow.user_repository.find_one(uuid=user_uuid, is_deleted=False)
        if not user:
            raise NotFoundError("User not found")
        current_user = uow.user_repository.find_one(uuid=current_uuid, is_deleted=False)
        if not current_user:
            raise NotFoundError("Current user not found")
        if user_uuid != current_uuid and not current_user.is_admin:
            raise BadRequestError("You are not authorized to view this user")
        dto = UserRead.from_orm(user).model_dump(mode="json")
        return jsonify(dto), 200


@auth_blueprint.route("/user/<string:user_uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def update_user(user_uuid: str):
    req = UserUpdate(**request.json)
    current_user_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        user_read = UserDomain.update_user(
            uow=uow,
            user_uuid=user_uuid,
            payload=req,
            current_user_uuid=current_user_uuid,
        )
        dto = user_read.model_dump(mode="json")
        uow.commit()
    return jsonify(dto), 200


@auth_blueprint.route("/users", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def list_users():
    # validate query-string args
    params = UserListParams(**request.args)

    # build SQLAlchemy filters
    filters = [UserModel.is_deleted == False]
    if params.uuid:
        filters.append(UserModel.uuid == params.uuid)
    if params.first_name:
        filters.append(UserModel.first_name == params.first_name)
    if params.last_name:
        filters.append(UserModel.last_name == params.last_name)
    if params.phone_number:
        filters.append(UserModel.phone_number == params.phone_number)
    if params.username:
        filters.append(UserModel.username == params.username)
    if params.email:
        filters.append(UserModel.email == params.email)
    if params.permission_scope:
        filters.append(UserModel.permission_scope == params.permission_scope.value)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.user_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )

        # convert each model to a read-DTO
        items = [
            UserRead.from_orm(user).model_dump(mode="json")
            for user in page_obj.items
        ]

        result = UserPage(
            users=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode="json")

    return jsonify(result), 200

@auth_blueprint.route("/user/<string:user_uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def delete_user(user_uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        user_read = UserDomain.delete_user(uow=uow, user_uuid=user_uuid)
        dto = user_read.model_dump(mode="json")
        uow.commit()
    return jsonify(dto), 200

# route to list permission scope enums
@auth_blueprint.route("/permissions", methods=["GET"])
def list_permissions():
    permissions = [p.value for p in PermissionScope]
    return jsonify(permissions), 200


# me endpoint
@auth_blueprint.route("/me", methods=["GET"])
@jwt_required()
def me():
    current_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        user = uow.user_repository.find_one(uuid=current_uuid, is_deleted=False)
        if not user:
            raise NotFoundError("User not found")
        dto = UserRead.from_orm(user).model_dump(mode="json")
        return jsonify(dto), 200


@auth_blueprint.route("/me", methods=["PUT"])
@jwt_required()
def update_me():
    """Self-service update of the caller's own preferences (e.g. preferred
    language). Deliberately separate from the admin-only /user/<uuid> PUT —
    MeUpdate only exposes safe fields."""
    from app.dto.auth import MeUpdate

    req = MeUpdate(**request.json)
    current_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        user = uow.user_repository.find_one(uuid=current_uuid, is_deleted=False)
        if not user:
            raise NotFoundError("User not found")
        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(user, key, value)
        uow.user_repository.save(model=user, commit=True)
        dto = UserRead.from_orm(user).model_dump(mode="json")
    return jsonify(dto), 200

