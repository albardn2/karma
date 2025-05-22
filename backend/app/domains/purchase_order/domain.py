from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.purchase_order import PurchaseOrderCreateWithItems
from app.dto.purchase_order import PurchaseOrderRead
from models.common import PurchaseOrder as PurchaseOrderModel
from app.domains.purchase_order_item.domain import PurchaseOrderItemDomain
from app.dto.purchase_order import PurchaseOrderCreate
from app.dto.purchase_order import PurchaseOrderStatus
from app.dto.purchase_order import PurchaseOrderUpdate
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError


class PurchaseOrderDomain:
    @staticmethod
    def create_purchase_order_with_items(uow: SqlAlchemyUnitOfWork, payload: PurchaseOrderCreateWithItems) -> PurchaseOrderRead:
        """
        Create a purchase order with items.
        """

        po = PurchaseOrderDomain.create_purchase_order(uow=uow, payload=payload.to_purchase_order_create())
        for item in payload.purchase_order_items:
            material = uow.material_repository.find_one(uuid=item.material_uuid, is_deleted=False)
            if not material:
                raise NotFoundError("Material not found")

            item.purchase_order_uuid = po.uuid
            item.currency = po.currency
            if item.unit:
                valid_unit = item.unit == material.measure_unit
                if not valid_unit:
                    raise BadRequestError(f"Invalid unit: {item.unit}. Expected: {material.measure_unit}")
            else:
                # Set the unit to the material's unit if not provided
                item.unit = material.measure_unit
        PurchaseOrderItemDomain.create_items(uow=uow, items=payload.purchase_order_items)
        return PurchaseOrderRead.from_orm(po)


    # ------------------------------------------------------------------


    @staticmethod
    def create_purchase_order(uow: SqlAlchemyUnitOfWork, payload: PurchaseOrderCreate) -> PurchaseOrderModel:
        """
        Create a purchase order with items.
        """
        data = payload.model_dump(exclude_unset=True)
        po = PurchaseOrderModel(**data)
        uow.purchase_order_repository.save(model=po, commit=False)
        return po

    @staticmethod
    def update_purchase_order(uow: SqlAlchemyUnitOfWork, uuid: str, payload: PurchaseOrderUpdate) -> PurchaseOrderRead:
        """
        Update a purchase order.
        """
        po = uow.purchase_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError("PurchaseOrder not found")
        data = payload.model_dump(exclude_unset=True)
        for field, val in data.items():
            setattr(po, field, val)
        uow.purchase_order_repository.save(model=po, commit=False)
        return PurchaseOrderRead.from_orm(po)

    @staticmethod
    def delete_purchase_order_with_items(uow: SqlAlchemyUnitOfWork, uuid: str) -> PurchaseOrderRead:
        """
        Delete a purchase order.
        """
        po = uow.purchase_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError("PurchaseOrder not found")

        PurchaseOrderDomain.validate_delete_purchase_order(uow=uow, po=po)
        po_item_uuids = [item.uuid for item in po.purchase_order_items]
        PurchaseOrderItemDomain.delete_items(uow=uow, uuids=po_item_uuids)
        po.is_deleted = True
        uow.purchase_order_repository.save(model=po, commit=False)
        return PurchaseOrderRead.from_orm(po)

    @staticmethod
    def validate_delete_purchase_order(uow: SqlAlchemyUnitOfWork, po: PurchaseOrderModel):
        """
        Validate if a purchase order can be deleted.
        """
        payouts = uow.payout_repository.find_all(purchase_order_uuid=po.uuid, is_deleted=False)
        if payouts:
            raise BadRequestError("PurchaseOrder has payout")

        if po.is_paid or po.net_amount_paid > 0:
            raise BadRequestError("PurchaseOrder has been paid or partially paid")
