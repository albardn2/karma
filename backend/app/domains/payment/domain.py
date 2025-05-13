from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.dto.payment import PaymentCreate, PaymentRead
from models.common import Payment as PaymentModel

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
            financial_account = uow.financial_account_repository.find_one(
                currency=payload.currency.value,
                is_deleted=False
            )
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
        if pay.financial_account.currency != payload.currency.value or pay.invoice.currency != payload.currency:
            raise BadRequestError(
                f"Currency mismatch: {pay.financial_account.currency} != {payload.currency.value}"
            )

        if pay.invoice.status == InvoiceStatus.PAID.value:
            raise BadRequestError(
                f"Invoice {pay.invoice.uuid} is already paid"
            )

        if pay.invoice.amount_paid   > pay.invoice.total_amount:
            raise BadRequestError(
                f"Payment amount {pay.invoice.amount_paid} is greater than invoice amount {pay.invoice.total_amount}"
            )
        if pay.invoice.amount_due == 0:
            pay.invoice.status = InvoiceStatus.PAID.value
            pay.invoice.paid_at = datetime.now()


        financial_account.balance += pay.amount
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
        pay.financial_account.balance -= pay.amount
        if pay.invoice.status == InvoiceStatus.PAID.value:
            pay.invoice.status = InvoiceStatus.PENDING.value
            pay.invoice.paid_at = None
        return PaymentRead.from_orm(pay)