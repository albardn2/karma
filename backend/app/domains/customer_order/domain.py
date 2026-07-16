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
from app.dto.customer_order import CustomerOrderCheckoutCreate


class CustomerOrderDomain:

    @staticmethod
    def create_order_checkout(uow: SqlAlchemyUnitOfWork, payload: CustomerOrderCheckoutCreate) -> CustomerOrderWithItemsAndInvoiceRead:
        """Create order + items + invoice, then optionally fulfill all items and
        record a full payment against the invoice — all in one transaction."""
        from app.dto.customer_order_item import CustomerOrderItemBulkFulfill, FulfillItem
        from app.domains.payment.domain import PaymentDomain
        from app.dto.payment import PaymentCreate

        full = CustomerOrderDomain.create_customer_order_with_items_and_invoice(
            uow=uow, payload=payload.to_base_create()
        )
        invoice = full.invoices[0]

        if payload.fulfill:
            CustomerOrderItemDomain.fulfill_items(
                uow=uow,
                payload=CustomerOrderItemBulkFulfill(
                    items=[FulfillItem(customer_order_item_uuid=item.uuid)
                           for item in full.customer_order.customer_order_items],
                    trip_stop_uuid=payload.trip_stop_uuid,
                ),
            )

        if payload.pay:
            inv = uow.invoice_repository.find_one(uuid=invoice.uuid, is_deleted=False)
            amount = inv.net_amount_due if inv else 0
            if amount and amount > 0:
                PaymentDomain.create_payment(
                    uow=uow,
                    payload=PaymentCreate(
                        created_by_uuid=payload.created_by_uuid,
                        invoice_uuid=invoice.uuid,
                        financial_account_uuid=payload.financial_account_uuid,
                        amount=amount,
                        currency=payload.currency,
                        payment_method=payload.payment_method,
                        trip_stop_uuid=payload.trip_stop_uuid,
                    ),
                )

        order = uow.customer_order_repository.find_one(uuid=full.customer_order.uuid, is_deleted=False)
        return CustomerOrderWithItemsAndInvoiceRead.from_customer_order_model(order)

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

        # refresh customer order read:
        customer_order = uow.customer_order_repository.find_one(uuid=customer_order_read.uuid,is_deleted=False)
        customer_order_read = CustomerOrderRead.from_orm(customer_order)
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
        # delete invoice items
        for invoice in order.invoices:
            payload = InvoiceItemBulkDelete(
                uuids=[item.uuid for item in invoice.invoice_items]
            )
            InvoiceItemDomain.delete_items(
                uow=uow,
                payload=payload
            )
        for invoice in order.invoices:
            InvoiceDomain.delete_invoice(
                uuid=invoice.uuid,
                uow=uow
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
        """Void an order: soft-delete it together with everything it caused —
        items, invoices, payments, and the inventory/vehicle events its
        fulfillment created (which restores warehouse/vehicle stock, since
        quantities are computed from non-deleted events). Unlike the
        validated delete, this intentionally works on paid/fulfilled orders:
        it exists to undo mistakes (e.g. an erroneous trip-stop checkout)."""
        from models.common import (
            InventoryEvent as InventoryEventModel,
            VehicleInventoryEvent as VehicleInventoryEventModel,
        )

        order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not order:
            raise NotFoundError("CustomerOrder not found")

        item_uuids = []
        for item in order.customer_order_items:
            if item.is_deleted:
                continue
            item.is_deleted = True
            item_uuids.append(item.uuid)
            uow.customer_order_item_repository.save(model=item, commit=False)

        for invoice in order.invoices:
            if invoice.is_deleted:
                continue
            for payment in invoice.payments:
                if not payment.is_deleted:
                    payment.is_deleted = True
                    uow.payment_repository.save(model=payment, commit=False)
            for inv_item in invoice.invoice_items:
                if not inv_item.is_deleted:
                    inv_item.is_deleted = True
                    uow.invoice_item_repository.save(model=inv_item, commit=False)
            invoice.is_deleted = True
            uow.invoice_repository.save(model=invoice, commit=False)

        if item_uuids:
            # warehouse-side deductions
            for ev in uow.session.query(InventoryEventModel).filter(
                InventoryEventModel.customer_order_item_uuid.in_(item_uuids),
                InventoryEventModel.is_deleted.is_(False),
            ):
                ev.is_deleted = True
            # vehicle-side sale events (trip checkouts)
            for ev in uow.session.query(VehicleInventoryEventModel).filter(
                VehicleInventoryEventModel.customer_order_item_uuid.in_(item_uuids),
                VehicleInventoryEventModel.is_deleted.is_(False),
            ):
                ev.is_deleted = True

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
            payments = [
                payment for payment in invoice.payments if not payment.is_deleted
            ]
            if payments:
                raise BadRequestError("Cannot delete a customer order with paid invoices.")

            if (not invoice.is_deleted) and invoice.is_paid or invoice.net_amount_paid > 0:
                raise BadRequestError("Cannot delete a customer order with paid invoices.")

