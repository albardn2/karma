from app.dto.payout import PayoutRead
from app.dto.payout import PayoutCreate
from models.common import Payout as PayoutModel
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.invoice import InvoiceStatus
from app.entrypoint.routes.common.errors import BadRequestError


class PayoutDomain:
    @staticmethod
    def create_payout(uow:SqlAlchemyUnitOfWork, payload: PayoutCreate) -> PayoutRead:
        data = payload.model_dump(mode='json')
        po = PayoutModel(**data)

        financial_account = uow.financial_account_repository.find_one(currency=payload.currency,is_deleted=False)
        po.financial_account = financial_account
        uow.payout_repository.save(model=po, commit=False)
        PayoutDomain.validate_currencies(payout=po)

        if po.purchase_order_uuid:
            if po.purchase_order.amount_due ==0:
                po.purchase_order.status = InvoiceStatus.PAID.value
                po.purchase_order.paid_at = po.created_at

        elif po.expense_uuid:
            if po.expense.amount_due ==0:
                po.expense.status = InvoiceStatus.PAID.value
                po.expense.paid_at = po.created_at

        elif po.credit_note_item_uuid:
            if po.credit_note_item.amount_due ==0:
                po.credit_note_item.status = InvoiceStatus.PAID.value
                po.credit_note_item.paid_at = po.created_at

        return PayoutRead.from_orm(po)

    @staticmethod
    def delete_payout(uow:SqlAlchemyUnitOfWork, uuid: str) -> PayoutRead:
        po = uow.payout_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError('Payout not found')

        po.is_deleted = True
        uow.payout_repository.save(model=po, commit=False)

        if po.purchase_order_uuid:
            po.purchase_order.status = InvoiceStatus.PENDING.value
            po.purchase_order.paid_at = None
        elif po.expense_uuid:
            po.expense.status = InvoiceStatus.PENDING.value
            po.expense.paid_at = None
        elif po.credit_note_item_uuid:
            po.credit_note_item.status = InvoiceStatus.PENDING.value
            po.credit_note_item.paid_at = None



        # add financial account domain to subtract from account balance
        return PayoutRead.from_orm(po)


    @staticmethod
    def validate_currencies(payout:PayoutModel):

        # validate currencies
        if payout.currency != payout.financial_account.currency:
            raise BadRequestError('Currency mismatch between payout and financial account')

        if payout.purchase_order_uuid:
            if payout.currency != payout.purchase_order.currency:
                raise BadRequestError('Currency mismatch between payout and purchase order')

        if payout.expense_uuid:
            if payout.currency != payout.expense.currency:
                raise BadRequestError('Currency mismatch between payout and expense')

        if payout.credit_note_item_uuid:
            if payout.currency != payout.credit_note_item.currency:
                raise BadRequestError('Currency mismatch between payout and credit note item')

