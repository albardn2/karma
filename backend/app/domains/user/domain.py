from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import RegisterRequest, SignupRequest, PermissionScope
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import User as UserModel
from models.common import Account as AccountModel
from app.dto.auth import UserRead
from app.dto.auth import UserUpdate
from app.entrypoint.routes.common.errors import NotFoundError


class UserDomain:
    @staticmethod
    def signup(uow: SqlAlchemyUnitOfWork, payload: SignupRequest) -> UserModel:
        """Create a company (account) and its first admin user atomically.
        Runs unscoped — no tenant exists yet at signup time."""
        UserDomain.validate_existing(uow=uow, payload=payload)

        account = AccountModel(
            company_name=payload.company_name,
            email=payload.email,
            phone_number=payload.phone_number,
        )
        uow.account_repository.save(model=account, commit=False)

        user = UserModel(
            username=payload.username,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone_number=payload.phone_number,
            language=payload.language,
            password=payload.password,  # replaced by the bcrypt hash below
            permission_scope=PermissionScope.ADMIN.value,
            account_uuid=account.uuid,
        )
        user.set_password(payload.password)
        uow.user_repository.save(model=user, commit=False)
        return user

    @staticmethod
    def create_user(uow: SqlAlchemyUnitOfWork, payload: RegisterRequest):
        """
        user = UserModel(**payload.model_dump())
        uow.user_repository.save(model=user, commit=True)
        return UserRead.from_orm(user).model_dump(mode="json")
        pass
        """

        UserDomain.validate_existing(uow=uow, payload=payload)
        user = UserModel(
            **payload.model_dump()
        )

        user.set_password(payload.password)
        uow.user_repository.save(model=user, commit=False)
        dto = UserRead.from_orm(user)
        return dto

    @staticmethod
    def update_user(uow: SqlAlchemyUnitOfWork,
                    user_uuid:str,
                    payload: UserUpdate,
                    current_user_uuid:str) -> UserRead:

        user = uow.user_repository.find_one(uuid=user_uuid, is_deleted=False)
        if not user:
            raise NotFoundError("User not found")

        # unscoped self-lookup (JWT identity; superuser may be impersonating)
        current_user = uow.session.query(UserModel).filter_by(
            uuid=current_user_uuid, is_deleted=False).one_or_none()
        if not current_user:
            raise NotFoundError("Current user not found")
        if current_user_uuid != user_uuid and not current_user.is_admin:
            raise BadRequestError("You are not authorized to update this user")
        UserDomain.validate_existing(uow=uow, payload=payload,updated_user=user)

        if payload.permission_scope and not current_user.is_admin:
            raise BadRequestError("You are not authorized to change permission scope")

        if payload.permissions is not None:
            if not current_user.is_admin:
                raise BadRequestError("You are not authorized to change permissions")
            final_scope = payload.permission_scope or user.permission_scope or ""
            if set(final_scope.split(",")) & {"admin", "superuser"}:
                raise BadRequestError(
                    "admins have full access — permissions apply to non-admin users only"
                )

        updates = payload.model_dump(exclude_unset=True)
        # these columns are NOT NULL; an explicit null in the payload means
        # "leave unchanged" (email/phone may still be cleared via null)
        for key in ("track_location", "location_ping_seconds"):
            if updates.get(key) is None:
                updates.pop(key, None)
        for field, val in updates.items():
            setattr(user, field, val)
        if payload.password:
            user.set_password(payload.password)

        uow.user_repository.save(model=user, commit=False)

        dto = UserRead.from_orm(user)
        return dto

    @staticmethod
    def delete_user(uow: SqlAlchemyUnitOfWork, user_uuid: str) -> UserRead:
        user = uow.user_repository.find_one(uuid=user_uuid, is_deleted=False)
        if not user:
            raise NotFoundError("User not found")
        user.is_deleted = True
        uow.user_repository.save(model=user, commit=False)
        dto = UserRead.from_orm(user)
        return dto

    @staticmethod
    def validate_existing(uow: SqlAlchemyUnitOfWork,payload,updated_user:UserModel = None):
        """
        Check if username and email are unique
        """
        username_changed = True
        email_changed = True
        if updated_user:
            username_changed = payload.username != updated_user.username
            email_changed = payload.email != updated_user.email


        # usernames/emails are globally unique (they identify the user at
        # login, before any account is known) — check across ALL accounts,
        # bypassing the tenant scope of the repositories
        if username_changed and uow.session.query(UserModel).filter_by(
                username=payload.username).first():
            raise BadRequestError(f"Username {payload.username!r} already taken")
        if email_changed and payload.email and uow.session.query(UserModel).filter_by(
                email=payload.email).first():
            raise BadRequestError(f"Email {payload.email!r} already registered")