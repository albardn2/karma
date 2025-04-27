from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.invoice_item import InvoiceItemBulkRead, InvoiceItemBulkCreate
from models.common import InvoiceItem as InvoiceItemModel

from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice_item import InvoiceItemRead
from app.dto.invoice_item import InvoiceItemBulkDelete


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
            item.is_deleted = True
            items.append(item)

        uow.invoice_item_repository.batch_save(models=items, commit=False)
        return InvoiceItemBulkRead(
            items=[InvoiceItemRead.from_orm(item) for item in items]
        )