from sqlalchemy.orm import selectinload

from app.adapters.repositories._abstract_repo import AbstractRepository
from app.adapters.repositories._serialization_loaders import (
    PURCHASE_ORDER_ITEM_NOTE_LOADERS,
)
from models.common import PurchaseOrder, PurchaseOrderItem


# Everything PurchaseOrderRead's derived fields walk. Mirrors
# models/common.py exactly:
#
#   vendor_name (1075)                   -> vendor
#   net_amount_paid (1118)               -> payouts
#       (also reached via net_amount_due 1137 -> is_paid 1145 ->
#        status 1153 / is_overdue 1169)
#   total_amount (1080), is_fulfilled (1190), fulfilled_at (1209),
#   purchase_order_items (dto:83)        -> purchase_order_items
#   PurchaseOrderItem.material_name (1259)
#                                        -> purchase_order_items -> material
#   total_adjusted_amount (1099)         -> purchase_order_items ->
#                                           adjusted_total_price (1303) ->
#                                           the note legs
#
# DebitNoteItem.amount/.inventory_change and their credit twins are plain
# columns (1724/1736, 1836/1846), so the chain genuinely stops there.
PURCHASE_ORDER_SERIALIZATION_LOADERS = [
    selectinload(PurchaseOrder.vendor),
    selectinload(PurchaseOrder.payouts),
    selectinload(PurchaseOrder.purchase_order_items).selectinload(
        PurchaseOrderItem.material
    ),
    selectinload(PurchaseOrder.purchase_order_items).options(
        *PURCHASE_ORDER_ITEM_NOTE_LOADERS
    ),
]


class PurchaseOrderRepository(AbstractRepository[PurchaseOrder]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = PurchaseOrder
