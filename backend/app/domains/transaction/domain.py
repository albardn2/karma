from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.transaction import TransactionCreate
from models.common import Transaction as TransactionModel
from app.dto.transaction import TransactionRead

from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError


class TransactionDomain:
    @staticmethod
    def create_transaction(uow: SqlAlchemyUnitOfWork, payload: TransactionCreate) -> TransactionRead:
        data = payload.model_dump(mode='json')
        tx = TransactionModel(**data)
        uow.transaction_repository.save(model=tx, commit=False)

        if not tx.from_account and not tx.to_account:
            raise BadRequestError('Transaction must have at least one account')

        # add and subtract account balance
        if tx.from_account:
            if tx.from_account.is_deleted:
                raise BadRequestError('Cannot use a deleted account')
            tx.from_account.balance -= tx.amount
            uow.financial_account_repository.save(model=tx.from_account, commit=False)

        if tx.to_account:
            if tx.to_account.is_deleted:
                raise BadRequestError('Cannot use a deleted account')
            tx.to_account.balance += tx.amount
            uow.financial_account_repository.save(model=tx.to_account, commit=False)

        return TransactionRead.from_orm(tx)


    @staticmethod
    def delete_transaction(uow: SqlAlchemyUnitOfWork, uuid: str) -> TransactionRead:
        tx = uow.transaction_repository.find_one(uuid=uuid, is_deleted=False)
        if not tx:
            raise NotFoundError('Transaction not found')

        # add and subtract account balance
        if tx.from_account:
            tx.from_account.balance += tx.amount
            uow.financial_account_repository.save(model=tx.from_account, commit=False)

        if tx.to_account:
            tx.to_account.balance -= tx.amount
            uow.financial_account_repository.save(model=tx.to_account, commit=False)

        tx.is_deleted = True
        uow.transaction_repository.save(model=tx)
        result = TransactionRead.from_orm(tx)
        return result


