from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.transaction import TransactionCreate
from models.common import Transaction as TransactionModel
from app.dto.transaction import TransactionRead

from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from app.dto.common_enums import Currency


class TransactionDomain:
    @staticmethod
    def create_transaction(uow: SqlAlchemyUnitOfWork, payload: TransactionCreate) -> TransactionRead:
        # validate payload
        TransactionDomain.validate_from_account_uuid_and_to_account_uuid(uow, payload)

        try:
            TransactionDomain.validate_create_payload(payload)
        except AssertionError as e:
            raise BadRequestError(str(e))


        data = payload.model_dump(mode='json')
        tx = TransactionModel(**data)
        uow.transaction_repository.save(model=tx, commit=False)

        if not tx.from_account and not tx.to_account:
            raise BadRequestError('Transaction must have at least one account')

        # add and subtract account balance
        if tx.from_account:
            if tx.from_account.is_deleted:
                raise BadRequestError('Cannot use a deleted account')
            # tx.from_account.balance -= tx.from_amount
            uow.financial_account_repository.save(model=tx.from_account, commit=False)

        if tx.to_account:
            if tx.to_account.is_deleted:
                raise BadRequestError('Cannot use a deleted account')
            # tx.to_account.balance += tx.to_amount
            uow.financial_account_repository.save(model=tx.to_account, commit=False)

        return TransactionRead.from_orm(tx)


    @staticmethod
    def delete_transaction(uow: SqlAlchemyUnitOfWork, uuid: str) -> TransactionRead:
        tx = uow.transaction_repository.find_one(uuid=uuid, is_deleted=False)
        if not tx:
            raise NotFoundError('Transaction not found')

        # add and subtract account balance
        if tx.from_account:
            tx.from_account.balance += tx.from_amount
            uow.financial_account_repository.save(model=tx.from_account, commit=False)

        if tx.to_account:
            tx.to_account.balance -= tx.to_amount
            uow.financial_account_repository.save(model=tx.to_account, commit=False)

        tx.is_deleted = True
        uow.transaction_repository.save(model=tx)
        result = TransactionRead.from_orm(tx)
        return result

    @staticmethod
    def validate_create_payload(
        payload: TransactionCreate,
    ) -> bool:

        if payload.from_account_uuid and not payload.to_account_uuid:
            assert payload.from_amount is not None, "from_amount must be provided"
            assert payload.from_currency is not None, "from_currency must be provided"
            assert payload.from_account_uuid is not None, "from_account_uuid must be provided"
            assert payload.to_currency is None, "to_currency must not be provided"
            assert payload.to_amount is None, "to_amount must not be provided"
            assert payload.usd_to_syp_exchange_rate is None, "usd_to_syp_exchange_rate must not be provided"
            assert payload.to_account_uuid is None, "to_account_uuid must not be provided"
            return True
        elif payload.to_account_uuid and not payload.from_account_uuid:
            assert payload.to_amount is not None, "to_amount must be provided"
            assert payload.to_currency is not None, "to_currency must be provided"
            assert payload.to_account_uuid is not None, "to_account_uuid must be provided"
            assert payload.from_currency is None, "from_currency must not be provided"
            assert payload.from_amount is None, "from_amount must not be provided"
            assert payload.usd_to_syp_exchange_rate is None, "usd_to_syp_exchange_rate must not be provided"
            assert payload.from_account_uuid is None, "from_account_uuid must not be provided"
            return True
        elif payload.from_account_uuid and payload.to_account_uuid:
            assert payload.from_amount is not None, "from_amount must be provided"
            assert payload.from_currency is not None, "from_currency must be provided"
            assert payload.from_account_uuid is not None, "from_account_uuid must be provided"
            assert payload.to_currency is not None, "to_currency must be provided"
            assert payload.to_amount is not None, "to_amount must be provided"
            assert payload.usd_to_syp_exchange_rate is not None, "usd_to_syp_exchange_rate must be provided"
            assert payload.to_account_uuid is not None, "to_account_uuid must be provided"
            if Currency(payload.from_currency) == Currency(payload.to_currency):
                assert payload.from_amount == payload.to_amount, "Amount must be equal for same currencies"

            if payload.from_currency == Currency.USD and payload.to_currency == Currency.SYP:
                assert payload.to_amount == payload.from_amount * payload.usd_to_syp_exchange_rate, "Amount must add up to the exchange rate"

            if payload.from_currency == Currency.SYP and payload.to_currency == Currency.USD:
                assert round(payload.to_amount,2) == round(payload.from_amount / payload.usd_to_syp_exchange_rate,2), "Amount must add up to the exchange rate"

    @staticmethod
    def validate_from_account_uuid_and_to_account_uuid(uow: SqlAlchemyUnitOfWork, payload: TransactionCreate):
        if payload.from_account_uuid:
            from_account = uow.financial_account_repository.find_one(
                uuid=payload.from_account_uuid, is_deleted=False
            )
            if not from_account:
                raise NotFoundError('From account not found')

            if  not payload.from_currency.value == from_account.currency:
                raise BadRequestError("from_currency must match the account currency")

        if payload.to_account_uuid:
            to_account = uow.financial_account_repository.find_one(
                uuid=payload.to_account_uuid, is_deleted=False
            )
            if not to_account:
                raise NotFoundError('To account not found')

            if not payload.to_currency.value == to_account.currency:
                raise BadRequestError("to_currency must match the account currency")
