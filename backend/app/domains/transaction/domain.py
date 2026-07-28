from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.transaction import TransactionCreate
from models.common import Transaction as TransactionModel
from app.dto.transaction import TransactionRead

from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from app.dto.common_enums import Currency


class TransactionDomain:
    @staticmethod
    def create_transaction(uow: SqlAlchemyUnitOfWork, payload: TransactionCreate) -> TransactionRead:
        # Shape first, accounts second: the account check dereferences
        # payload.from_currency.value, so running it first turns a missing
        # currency into an AttributeError 500 instead of the 400 the shape
        # validation is there to produce.
        try:
            TransactionDomain.validate_create_payload(payload)
        except AssertionError as e:
            raise BadRequestError(str(e))

        TransactionDomain.validate_from_account_uuid_and_to_account_uuid(uow, payload)

        data = payload.model_dump(mode='json')
        tx = TransactionModel(**data)
        uow.transaction_repository.save(model=tx, commit=False)

        # NOTE: no balance to write back — FinancialAccount.balance is computed
        # from its payments/payouts/transactions, so saving the accounts here
        # (as this used to) achieved nothing.
        return TransactionRead.from_orm(tx)


    @staticmethod
    def delete_transaction(uow: SqlAlchemyUnitOfWork, uuid: str) -> TransactionRead:
        tx = uow.transaction_repository.find_one(uuid=uuid, is_deleted=False)
        if not tx:
            raise NotFoundError('Transaction not found')
        tx.is_deleted = True
        uow.transaction_repository.save(model=tx)
        result = TransactionRead.from_orm(tx)
        return result

    # money is compared at 2 decimals: from_amount * rate is binary floating
    # point, so 3.3 * 14500.5 is 47851.649999999994 and an exact == rejects the
    # correct answer of 47851.65
    MONEY_DP = 2
    # half a cent: the widest a correctly-rounded amount can sit from the exact
    # product, plus a hair for float representation error at the boundary
    MONEY_TOLERANCE = 0.005 + 1e-9

    @staticmethod
    def _same_money(a: float, b: float) -> bool:
        """Do these two amounts agree to the cent?

        Rounding BOTH sides and comparing looks equivalent but is not, because
        the caller and we do not round the same way. The web form derives its
        amount with JS `Math.round`, which breaks exact halves upward; Python's
        `round` breaks them to even. A rate ending in .5 — which is exactly what
        the midpoint of a buy/sell pair gives, and what the exchange-rate
        feature now pre-fills — lands on those halves constantly: measured at
        an old-pound rate of 13387.5, 22.7% of cent amounts between 1.00 and
        2000.00 produced a one-cent disagreement, and every one was rejected with
        "Amount must add up to the exchange rate" while being correct to the
        penny. Redenomination shrank the rate but not the arithmetic: a
        fractional rate still breaks halves.

        So compare distance instead. One side is always the exact product, and
        any honestly-rounded amount is within half a cent of it.
        """
        return abs(a - b) <= TransactionDomain.MONEY_TOLERANCE

    @staticmethod
    def validate_create_payload(
        payload: TransactionCreate,
    ) -> bool:

        assert payload.from_account_uuid or payload.to_account_uuid, \
            "Transaction must have at least one account"
        assert not (
            payload.from_account_uuid
            and payload.from_account_uuid == payload.to_account_uuid
        ), "from_account_uuid and to_account_uuid must differ"

        if payload.from_account_uuid and not payload.to_account_uuid:
            assert payload.from_amount is not None, "from_amount must be provided"
            assert payload.from_currency is not None, "from_currency must be provided"
            assert payload.to_currency is None, "to_currency must not be provided"
            assert payload.to_amount is None, "to_amount must not be provided"
            assert payload.usd_to_syp_exchange_rate is None, "usd_to_syp_exchange_rate must not be provided"
            return True
        elif payload.to_account_uuid and not payload.from_account_uuid:
            assert payload.to_amount is not None, "to_amount must be provided"
            assert payload.to_currency is not None, "to_currency must be provided"
            assert payload.from_currency is None, "from_currency must not be provided"
            assert payload.from_amount is None, "from_amount must not be provided"
            assert payload.usd_to_syp_exchange_rate is None, "usd_to_syp_exchange_rate must not be provided"
            return True

        # both sides: a transfer
        assert payload.from_amount is not None, "from_amount must be provided"
        assert payload.from_currency is not None, "from_currency must be provided"
        assert payload.to_currency is not None, "to_currency must be provided"
        assert payload.to_amount is not None, "to_amount must be provided"

        if Currency(payload.from_currency) == Currency(payload.to_currency):
            # same currency is not an exchange: demanding a USD/SYP rate here
            # made moving money to an external account impossible without
            # inventing a rate of 1
            assert TransactionDomain._same_money(payload.from_amount, payload.to_amount), \
                "Amount must be equal for same currencies"
            return True

        assert payload.usd_to_syp_exchange_rate is not None, \
            "usd_to_syp_exchange_rate must be provided"

        if payload.from_currency == Currency.USD and payload.to_currency == Currency.SYP:
            assert TransactionDomain._same_money(
                payload.to_amount, payload.from_amount * payload.usd_to_syp_exchange_rate
            ), "Amount must add up to the exchange rate"

        if payload.from_currency == Currency.SYP and payload.to_currency == Currency.USD:
            assert TransactionDomain._same_money(
                payload.to_amount, payload.from_amount / payload.usd_to_syp_exchange_rate
            ), "Amount must add up to the exchange rate"

        return True

    @staticmethod
    def validate_from_account_uuid_and_to_account_uuid(uow: SqlAlchemyUnitOfWork, payload: TransactionCreate):
        if payload.from_account_uuid:
            from_account = uow.financial_account_repository.find_one(
                uuid=payload.from_account_uuid, is_deleted=False
            )
            if not from_account:
                raise NotFoundError('From account not found')

            if not payload.from_currency or payload.from_currency.value != from_account.currency:
                raise BadRequestError("from_currency must match the account currency")

        if payload.to_account_uuid:
            to_account = uow.financial_account_repository.find_one(
                uuid=payload.to_account_uuid, is_deleted=False
            )
            if not to_account:
                raise NotFoundError('To account not found')

            if not payload.to_currency or payload.to_currency.value != to_account.currency:
                raise BadRequestError("to_currency must match the account currency")
