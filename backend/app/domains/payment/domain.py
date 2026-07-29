from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.financial_account.domain import FinancialAccountDomain

from app.dto.payment import PaymentCreate, PaymentRead
from models.common import MONEY_TOLERANCE, Payment as PaymentModel

from app.entrypoint.routes.common.errors import BadRequestError
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice import InvoiceStatus


class PaymentDomain:


    @staticmethod
    def create_payment(uow: SqlAlchemyUnitOfWork, payload: PaymentCreate) -> PaymentRead:
        """
        Create a payment in the database.
        """
        if not payload.financial_account_uuid:
            financial_account = FinancialAccountDomain.resolve_default(
                uow=uow, currency=payload.currency)
            if not financial_account:
                raise NotFoundError('Financial account not found')
            payload.financial_account_uuid = financial_account.uuid
        else:
            financial_account = uow.financial_account_repository.find_one(
                uuid=payload.financial_account_uuid,
                is_deleted=False
            )
            if not financial_account:
                raise NotFoundError('Financial account not found')
        data = payload.model_dump(mode='json')
        pay = PaymentModel(**data)
        uow.payment_repository.save(model=pay, commit=False)
        pay.financial_account = financial_account
        if pay.financial_account.currency != payload.currency.value:
            raise BadRequestError(
                f"Currency mismatch: {pay.financial_account.currency} != {payload.currency.value}"
            )
        if pay.invoice:
            if pay.invoice.currency != payload.currency:
                raise BadRequestError(
                    f"Currency mismatch: {pay.invoice.currency} != {payload.currency.value}"
                )
        if pay.debit_note_item:
            if pay.debit_note_item.currency != payload.currency:
                raise BadRequestError(
                    f"Currency mismatch: {pay.debit_note_item.currency} != {payload.currency.value}"
                )


        # Tolerant by half a cent, deliberately. This runs AFTER the payment is
        # flushed, so net_amount_due already includes it — and an invoice paid in
        # instalments lands a hair below zero from float dust (12.30 settled as
        # 4.10 x3 gives -1.8e-15). A bare `< 0` therefore rejected the very
        # payment that settled the balance. A real overpayment is at least one
        # cent and still refused.
        if pay.invoice and pay.invoice.net_amount_due < -MONEY_TOLERANCE:
            raise BadRequestError(
                f"payment amount {pay.amount} is larger than the {pay.invoice.currency} "
                f"{round(pay.invoice.net_amount_due + pay.amount, 2)} still due"
            )

        # Same tolerance as the invoice branch above. Leaving this at a bare `< 0`
        # would keep exactly the bug that branch was changed to fix, two lines
        # apart in the same function: the instalment that settles a debit note
        # gets refused over float dust.
        if pay.debit_note_item and pay.debit_note_item.amount_due < -MONEY_TOLERANCE:
            raise BadRequestError(
                f"payment amount {pay.amount} is larger than the "
                f"{round(pay.debit_note_item.amount_due + pay.amount, 2)} still due "
                f"on debit note item {pay.debit_note_item.uuid}"
            )

        # financial_account.balance += pay.amount
        return PaymentRead.from_orm(pay)

    @staticmethod
    def delete_payment(uow: SqlAlchemyUnitOfWork, uuid: str) -> PaymentRead:
        """
        Update a payment in the database.
        """
        pay = uow.payment_repository.find_one(uuid=uuid, is_deleted=False)
        if not pay:
            raise NotFoundError('Payment not found')

        pay.is_deleted = True
        uow.payment_repository.save(model=pay, commit=False)
        # pay.financial_account.balance -= pay.amount
        # if pay.invoice.status == InvoiceStatus.PAID.value:
        #     pay.invoice.status = InvoiceStatus.PENDING.value
        #     pay.invoice.paid_at = None
        return PaymentRead.from_orm(pay)