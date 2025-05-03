from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import RegisterRequest
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import User as UserModel
from app.dto.auth import UserRead
from app.dto.auth import UserUpdate
from app.entrypoint.routes.common.errors import NotFoundError


class UserDomain:
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

        current_user = uow.user_repository.find_one(uuid=current_user_uuid, is_deleted=False)
        if not current_user:
            raise NotFoundError("Current user not found")
        if current_user_uuid != user_uuid and not current_user.is_admin:
            raise BadRequestError("You are not authorized to update this user")
        UserDomain.validate_existing(uow=uow, payload=payload)

        if payload.permission_scope and not current_user.is_admin:
            raise BadRequestError("You are not authorized to change permission scope")

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(user, field, val)

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
    def validate_existing(uow: SqlAlchemyUnitOfWork, payload):
        """
        Check if username and email are unique
        """
        if uow.user_repository.find_one(username=payload.username, is_deleted=False):
            raise BadRequestError(f"Username {payload.username!r} already taken")
        if payload.email and uow.user_repository.find_one(email=payload.email, is_deleted=False):
            raise BadRequestError(f"Email {payload.email!r} already registered")