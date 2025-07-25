from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.invoice import InvoiceCreate
from app.dto.invoice import InvoiceRead
from models.common import Invoice as InvoiceModel
from app.dto.invoice import InvoiceStatus
from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.invoice import InvoiceUpdate

from app.entrypoint.routes.common.errors import BadRequestError


class InvoiceDomain:


    @staticmethod
    def create_invoice(uow:SqlAlchemyUnitOfWork, payload: InvoiceCreate) -> dict:
        """
        Create an invoice in the database.
        """
        data = payload.model_dump()
        inv = InvoiceModel(**data)
        # inv.status = InvoiceStatus.PENDING.value
        inv.currency = payload.currency.value
        uow.invoice_repository.save(model=inv, commit=False)
        return InvoiceRead.from_orm(inv)

    @staticmethod
    def update_invoice(uow:SqlAlchemyUnitOfWork, uuid: str, payload: InvoiceUpdate) -> InvoiceRead:
        """
        Update an invoice in the database.
        """
        inv = uow.invoice_repository.find_one(uuid=uuid,is_deleted=False)
        if not inv:
            raise NotFoundError('Invoice not found')

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(inv, field, val)

        uow.invoice_repository.save(model=inv, commit=False)
        return InvoiceRead.from_orm(inv)


    @staticmethod
    def delete_invoice(uow:SqlAlchemyUnitOfWork, uuid: str) -> InvoiceRead:
        """
        Update an invoice in the database.
        """
        inv = uow.invoice_repository.find_one(uuid=uuid,is_deleted=False)
        if not inv:
            raise NotFoundError('Invoice not found')

        InvoiceDomain.validate_delete_invoice(invoice=inv)

        inv.is_deleted = True
        uow.invoice_repository.save(model=inv, commit=False)
        return InvoiceRead.from_orm(inv)

    @staticmethod
    def validate_delete_invoice(
        invoice: InvoiceModel
    ):
        """
        Validate if an invoice can be deleted.
        """
        payments= [
            payment for payment in invoice.payments if not payment.is_deleted
        ]
        if payments:
            raise BadRequestError("Cannot delete an invoice with payments.")

