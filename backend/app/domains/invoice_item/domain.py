from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.invoice_item import InvoiceItemBulkRead, InvoiceItemBulkCreate
from models.common import InvoiceItem as InvoiceItemModel

from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice_item import InvoiceItemRead
from app.dto.invoice_item import InvoiceItemBulkDelete
from models.common import InvoiceItem

from app.entrypoint.routes.common.errors import BadRequestError


class InvoiceItemDomain:
    @staticmethod
    def create_items(uow: SqlAlchemyUnitOfWork, payload: InvoiceItemBulkCreate) -> InvoiceItemBulkRead:
        """
        Create invoice items in bulk.
        """
        invoice_items = []
        for item in payload.items:
            customer_order_item = uow.customer_order_item_repository.find_one(
                uuid=item.customer_order_item_uuid,
                is_deleted=False
            )
            material = customer_order_item.material
            if not material:
                raise NotFoundError(f'Material with UUID {material.uuid} not found')

            data = item.model_dump(mode='json')
            invoice_item = InvoiceItemModel(**data)
            invoice_item.unit = material.measure_unit
            invoice_items.append(invoice_item)

        uow.invoice_item_repository.batch_save(models=invoice_items,commit=False)
        return InvoiceItemBulkRead(
            items=[InvoiceItemRead.from_orm(item) for item in invoice_items]
        )


    @staticmethod
    def delete_items(uow: SqlAlchemyUnitOfWork, payload: InvoiceItemBulkDelete) -> InvoiceItemBulkRead:
        """
        Delete invoice items in bulk.
        """
        items = []
        for item_uuid in payload.uuids:
            item = uow.invoice_item_repository.find_one(uuid=item_uuid, is_deleted=False)
            if not item:
                raise NotFoundError('InvoiceItem not found')
            InvoiceItemDomain.validate_item_delete(item=item)
            item.is_deleted = True
            items.append(item)

        uow.invoice_item_repository.batch_save(models=items, commit=False)
        return InvoiceItemBulkRead(
            items=[InvoiceItemRead.from_orm(item) for item in items]
        )

    @staticmethod
    def validate_item_delete(
        item: InvoiceItem
    ):
        """
        Validate if invoice items can be deleted.
        """
        debit_notes = [dn for dn in item.debit_note_items if not dn.is_deleted]
        credit_notes = [cn for cn in item.credit_note_items if not cn.is_deleted]
        if debit_notes or credit_notes:
            raise BadRequestError(
                f"InvoiceItem {item.uuid} cannot be deleted because it is referenced by debit notes {debit_notes} or credit notes {credit_notes}"
            )
