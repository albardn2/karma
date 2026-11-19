"""A company closing its own account."""
from app.entrypoint.routes.common.errors import ApiError
from models.common import Account as AccountModel, User as UserModel


class AccountDeletionRefused(ApiError):
    """403 with a machine-readable `code`. Deliberately never 401: both clients
    sign the user out on a 401, and a mistyped password must not do that."""

    def __init__(self, message: str, code: str):
        super().__init__(message, status_code=403, payload={"code": code})


class AccountDomain:
    @staticmethod
    def delete_own_account(uow, user: UserModel, password: str) -> AccountModel:
        """Soft-delete the caller's company. Every user of it is then refused at
        sign-in, at token refresh and on every request (see `_load_request_identity`),
        so live sessions end on their next call. Nothing else is removed: the
        company's orders, invoices and payments stay as they were.

        Only a company admin may do it, and only after re-entering their password.
        The platform owner is refused: they are exempt from the account gates, so
        deleting their company would lock out its users but never them.
        """
        if user.is_superuser:
            raise AccountDeletionRefused(
                "The platform owner's company cannot be deleted from here", "platform_owner"
            )
        if not user.is_admin:
            raise AccountDeletionRefused("Only a company admin can delete the account", "not_admin")
        if not user.verify_password(password):
            raise AccountDeletionRefused("Incorrect password", "wrong_password")

        account = uow.account_repository.find_one(uuid=user.account_uuid, is_deleted=False)
        if not account:
            raise AccountDeletionRefused("This account no longer exists", "account_missing")
        account.is_deleted = True
        uow.session.flush()
        return account
