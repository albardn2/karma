from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.purchase_order import PurchaseOrderCreateWithItems
from app.dto.purchase_order import PurchaseOrderRead
from models.common import PurchaseOrder as PurchaseOrderModel
from app.domains.purchase_order_item.domain import PurchaseOrderItemDomain
from app.dto.purchase_order import PurchaseOrderCreate
from app.dto.purchase_order import PurchaseOrderStatus
from app.dto.purchase_order import PurchaseOrderUpdate
from app.dto.purchase_order_item import PurchaseOrderItemEdit
from models.common import MONEY_TOLERANCE
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
            item.purchase_order_uuid = po.uuid
        # currency (from this order) and unit (from the material) are resolved
        # inside create_items, so both create paths derive them the same way
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
        data.pop("purchase_order_items", None)
        for field, val in data.items():
            setattr(po, field, val)

        if payload.purchase_order_items:
            PurchaseOrderDomain.edit_items(uow=uow, po=po, edits=payload.purchase_order_items)

        uow.purchase_order_repository.save(model=po, commit=False)
        return PurchaseOrderRead.from_orm(po)

    @staticmethod
    def edit_items(uow: SqlAlchemyUnitOfWork, po: PurchaseOrderModel, edits: list[PurchaseOrderItemEdit]) -> None:
        """Apply line corrections, then check the order still covers its payouts.

        Payouts cannot be edited, so an order whose total drops below what has
        been paid out could never be settled again — a further payout or credit
        note on it is refused once its amount due is negative. Only an edit that
        makes that worse is refused, so an already-overpaid order can still be
        corrected towards its payouts.
        """
        uuids = [edit.uuid for edit in edits]
        if len(set(uuids)) != len(uuids):
            raise BadRequestError("Each purchase order item can only be edited once per request")

        due_before = po.net_amount_due
        live_items = {item.uuid: item for item in po.purchase_order_items if not item.is_deleted}
        for edit in edits:
            po_item = live_items.get(edit.uuid)
            if not po_item:
                raise NotFoundError(f"PurchaseOrderItem {edit.uuid} not found on this purchase order")
            PurchaseOrderItemDomain.edit_item(uow=uow, po_item=po_item, edit=edit)

        if po.net_amount_due < -MONEY_TOLERANCE and po.net_amount_due < due_before:
            raise BadRequestError(
                f"The order's new total ({po.total_adjusted_amount:g} {po.currency}) is less than "
                f"the {po.net_amount_paid:g} already paid out on it — remove a payout first"
            )

    @staticmethod
    def delete_purchase_order_with_items(uow: SqlAlchemyUnitOfWork, uuid: str) -> PurchaseOrderRead:
        """
        Delete a purchase order.
        """
        po = uow.purchase_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError("PurchaseOrder not found")

        PurchaseOrderDomain.validate_delete_purchase_order(uow=uow, po=po)
        # a line removed on its own earlier is already gone; delete_item would
        # report it as not found and refuse the whole order
        po_item_uuids = [item.uuid for item in po.purchase_order_items if not item.is_deleted]
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

        # not is_paid: that only says nothing is due, which is also true of an
        # order whose lines total 0 and that has never been paid at all
        if po.net_amount_paid > 0:
            raise BadRequestError("PurchaseOrder has been paid or partially paid")
