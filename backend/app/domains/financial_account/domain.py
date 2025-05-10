
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
            uow.payments.find_one(financial_account_uuid=financial_account.uuid, is_deleted=False) or
            uow.payouts.find_one(financial_account_uuid=financial_account.uuid, is_deleted=False) or
            uow.transactions.find_one(from_account_uuid=financial_account.uuid, is_deleted=False) or
            uow.transactions.find_one(to_account_uuid=financial_account.uuid, is_deleted=False)
        ):
            return False

        return True
