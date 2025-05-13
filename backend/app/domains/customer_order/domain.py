from datetime import datetime
from app.dto.customer_order import CustomerOrderCreate,CustomerOrderRead,CustomerOrderUpdate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import CustomerOrder as CustomerOrderModel
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.customer_order import CustomerOrderWithItemsAndInvoiceCreate
from app.domains.customer_order_item.domain import CustomerOrderItemDomain
from app.domains.invoice.domain import InvoiceDomain
from app.dto.invoice_item import InvoiceItemBulkCreate
from app.dto.invoice_item import InvoiceItemCreate
from app.domains.invoice_item.domain import InvoiceItemDomain
from app.dto.customer_order import CustomerOrderWithItemsAndInvoiceRead
from app.dto.invoice import InvoiceRead
from app.dto.customer_order_item import CustomerOrderItemRead
from app.dto.invoice_item import InvoiceItemRead
from app.dto.customer_order_item import CustomerOrderItemBulkDelete
from app.dto.invoice_item import InvoiceItemBulkDelete
from app.entrypoint.routes.common.errors import BadRequestError


class CustomerOrderDomain:

    @staticmethod
    def create_customer_order_with_items_and_invoice(uow: SqlAlchemyUnitOfWork,payload:CustomerOrderWithItemsAndInvoiceCreate) -> CustomerOrderRead:

        # Create the customer order

        customer_order_create = payload.to_customer_order_create()
        customer_order_read = CustomerOrderDomain.create_customer_order(uow=uow, payload=customer_order_create)

        customer_order_items_bulk_create = payload.to_customer_order_item_bulk_create(
            customer_order_uuid=customer_order_read.uuid
        )
        customer_order_items_read = CustomerOrderItemDomain.create_items(
            uow=uow,
            payload=customer_order_items_bulk_create
        )
        customer_order_read.customer_order_items = customer_order_items_read.items

        # Create the invoice
        invoice_create = payload.to_invoice_create(
            customer_order_uuid=customer_order_read.uuid,
        )
        invoice_read = InvoiceDomain.create_invoice(uow=uow,payload=invoice_create)
        invoice_item_create_list = []
        for coi, payload_item in zip(customer_order_items_read.items,payload.items):
            assert coi.material_uuid == payload_item.material_uuid
            invoice_item_create = InvoiceItemCreate(
                created_by_uuid=payload.created_by_uuid,
                invoice_uuid=invoice_read.uuid,
                customer_order_item_uuid=coi.uuid,
                price_per_unit=payload_item.price_per_unit,
            )
            invoice_item_create_list.append(invoice_item_create)
        invoice_items_create = InvoiceItemBulkCreate(items=invoice_item_create_list)
        invoice_items_read = InvoiceItemDomain.create_items(
            uow=uow,
            payload=invoice_items_create
        )
        invoice_read.invoice_items = invoice_items_read.items

        # refresh invoice read:
        invoice = uow.invoice_repository.find_one(uuid=invoice_read.uuid,is_deleted=False)
        if not invoice:
            raise NotFoundError("Invoice not found")
        invoice_read = InvoiceRead.from_orm(invoice)
        result = CustomerOrderWithItemsAndInvoiceRead(
            customer_order=customer_order_read,
            invoices=[invoice_read],
        )
        return result

    @staticmethod
    def delete_customer_order_with_items_and_invoice(uuid:str, uow: SqlAlchemyUnitOfWork) -> CustomerOrderRead:
        # fetch existing order
        order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not order:
            raise NotFoundError("CustomerOrder not found")

        CustomerOrderDomain.validate_delete_customer_order(customer_order=order)

        # delete all related items
        payload = CustomerOrderItemBulkDelete(
            uuids=[item.uuid for item in order.customer_order_items]
        )
        CustomerOrderItemDomain.delete_items(
            payload=payload,
            uow=uow
        )
        for invoice in order.invoices:
            InvoiceDomain.delete_invoice(
                uuid=invoice.uuid,
                uow=uow
            )
        # delete invoice items
        for invoice in order.invoices:
            payload = InvoiceItemBulkDelete(
                uuids=[item.uuid for item in invoice.invoice_items]
            )
            InvoiceItemDomain.delete_items(
                uow=uow,
                payload=payload
            )
        # delete customer order
        order.is_deleted = True
        uow.customer_order_repository.save(model=order, commit=False)
        result = CustomerOrderWithItemsAndInvoiceRead.from_customer_order_model(order)
        return result

    # ------------------------------------ CUSTOMER ORDER -----------------------------------
    @staticmethod
    def create_customer_order(uow: SqlAlchemyUnitOfWork,payload:CustomerOrderCreate) -> CustomerOrderRead:
        order = CustomerOrderModel(**payload.model_dump(mode="json"))
        uow.customer_order_repository.save(model=order, commit=False)
        result = CustomerOrderRead.from_orm(order)
        return result

    @staticmethod
    def update_customer_order(uuid:str,uow: SqlAlchemyUnitOfWork,payload: CustomerOrderUpdate) -> CustomerOrderRead:
        # fetch existing order
        order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not order:
            raise NotFoundError("CustomerOrder not found")

        for field, val in payload.model_dump(mode="json").items():
            setattr(order, field, val)

        uow.customer_order_repository.save(model=order, commit=False)
        result = CustomerOrderRead.from_orm(order)
        return result

    @staticmethod
    def delete_customer_order(uuid:str, uow: SqlAlchemyUnitOfWork) -> CustomerOrderRead:
        # fetch existing order
        order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not order:
            raise NotFoundError("CustomerOrder not found")

        #TODO: delete all related items
        order.is_deleted = True
        uow.customer_order_repository.save(model=order, commit=False)
        result = CustomerOrderRead.from_orm(order)
        return result

    @staticmethod
    def validate_delete_customer_order(
            customer_order: CustomerOrderModel
    ):
        """
        Validate if a customer order can be deleted.
        """

        if customer_order.is_fulfilled:
            raise BadRequestError("Cannot delete a fulfilled customer order.")

        for invoice in customer_order.invoices:
            if (not invoice.is_deleted) and invoice.is_paid or invoice.amount_paid > 0:
                raise BadRequestError("Cannot delete a customer order with paid invoices.")

