
from app.entrypoint.routes.common.errors import NotFoundError
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from models.common import FinancialAccount
from app.entrypoint.routes.common.errors import BadRequestError

from app.dto.financial_account import FinancialAccountUpdate, FinancialAccountRead


class FinancialAccountDomain:

    UPDATE_SENSITIVE_FIELDS = [
        'currency'
    ]

    @staticmethod
    def resolve_default(uow: SqlAlchemyUnitOfWork, currency) -> FinancialAccount:
        """The tenant's single non-external account for a currency.

        This is what payments/payouts fall back to when the caller does not name
        an account. Callers pass either the Currency enum or a plain string, so
        normalise here rather than at each call site.
        """
        value = getattr(currency, 'value', currency)
        return uow.financial_account_repository.find_one(
            currency=value, is_deleted=False, is_external=False
        )

    @staticmethod
    def assert_no_internal_duplicate(uow: SqlAlchemyUnitOfWork, currency, exclude_uuid=None):
        """Guard the one-internal-account-per-currency invariant.

        The DB has a partial unique index for this, but a violation there
        surfaces at commit time as an IntegrityError (a 500) — this gives the
        caller a 400 that names the account already holding the slot.
        """
        existing = FinancialAccountDomain.resolve_default(uow=uow, currency=currency)
        if existing and existing.uuid != exclude_uuid:
            value = getattr(currency, 'value', currency)
            raise BadRequestError(
                f"'{existing.account_name}' is already the {value} account. "
                "Only one non-external account per currency is allowed — mark "
                "this one external, or edit the existing account."
            )


    @staticmethod
    def update_financial_account(uow:SqlAlchemyUnitOfWork, uuid: str, payload: FinancialAccountUpdate) -> FinancialAccountRead:
        """
        Update a financial account in the database.
        """
        acc = uow.financial_account_repository.find_one(uuid=uuid,is_deleted=False)
        if not acc:
            raise NotFoundError('Financial account not found')

        updates = payload.model_dump(exclude_unset=True,mode='json')
        if any(field in FinancialAccountDomain.UPDATE_SENSITIVE_FIELDS for field in updates.keys()) and not FinancialAccountDomain.validate_no_relation_exists(uow,acc):
            raise BadRequestError('Cannot update currency, relations exist')

        # an update can walk into the internal slot two ways: switching currency,
        # or flipping external -> internal
        next_currency = updates.get('currency', acc.currency)
        next_external = updates.get('is_external', acc.is_external)
        if not next_external:
            FinancialAccountDomain.assert_no_internal_duplicate(
                uow=uow, currency=next_currency, exclude_uuid=acc.uuid
            )

        for field, val in updates.items():
            setattr(acc, field, val)

        uow.financial_account_repository.save(model=acc, commit=False)
        return FinancialAccountRead.from_orm(acc)
    @staticmethod
    def delete_financial_account(uow:SqlAlchemyUnitOfWork, uuid: str) -> FinancialAccountRead:
        """
        Update a financial account in the database.
        """
        acc = uow.financial_account_repository.find_one(uuid=uuid,is_deleted=False)
        if not acc:
            raise NotFoundError('Financial account not found')

        if not FinancialAccountDomain.validate_no_relation_exists(uow,acc):
            raise BadRequestError('Cannot delete financial account, relations exist')

        acc.is_deleted = True
        uow.financial_account_repository.save(model=acc, commit=False)
        return FinancialAccountRead.from_orm(acc)

    @staticmethod
    def validate_no_relation_exists(uow:SqlAlchemyUnitOfWork, financial_account: FinancialAccount):
        """
        Validate that no relations exist for the financial account.
        relations:
            payments = relationship("Payment", back_populates="financial_account")
            payouts = relationship("Payout", back_populates="financial_account")
            transactions_from = relationship("Transaction", foreign_keys="Transaction.from_account_uuid", back_populates="from_account")
            transactions_to = relationship("Transaction", foreign_keys="Transaction.to_account_uuid", back_populates="to_account")

        """
        if (
            uow.payment_repository.find_first(financial_account_uuid=financial_account.uuid, is_deleted=False) or
            uow.payout_repository.find_first(financial_account_uuid=financial_account.uuid, is_deleted=False) or
            uow.transaction_repository.find_first(from_account_uuid=financial_account.uuid, is_deleted=False) or
            uow.transaction_repository.find_first(to_account_uuid=financial_account.uuid, is_deleted=False)
        ):
            return False

        return True
