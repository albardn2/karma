from datetime import datetime

from app.dto.inventory import InventoryRead
from models.common import Inventory as InventoryModel
from app.dto.inventory import InventoryCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.dto.inventory import InventoryFIFOOutput


class InventoryDomain:
    @staticmethod
    def create_inventory(uow:SqlAlchemyUnitOfWork, payload: InventoryCreate) -> InventoryRead:
        inventory = InventoryModel(**payload.model_dump())
        material = uow.material_repository.find_one(uuid=payload.material_uuid, is_deleted=False)
        if not material:
            raise NotFoundError('Material not found')
        inventory.unit = material.measure_unit

        if not inventory.lot_id:
            inventory.lot_id = InventoryDomain.generate_lot_id_dashed()

        uow.inventory_repository.save(model=inventory,commit=False)
        dto = InventoryRead.from_orm(inventory)
        InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=dto)
        return dto


    @staticmethod
    def delete_inventory(uow: SqlAlchemyUnitOfWork, uuid: str) -> InventoryRead:
        inventory = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError('Inventory not found')

        inventory_events = uow.inventory_event_repository.find_all(
            inventory_uuid=inventory.uuid,
            is_deleted=False
        )
        if inventory_events:
            raise NotFoundError('Inventory has inventory events, cannot be deleted')

        inventory.is_deleted = True
        uow.inventory_repository.save(model=inventory,commit=False)
        return InventoryRead.from_orm(inventory)

    @staticmethod
    def generate_lot_id_dashed() -> str:
        return datetime.utcnow().strftime("%Y-%m-%d-%H:%M:%S")

    @staticmethod
    def enrich_cost_per_unit(uow: SqlAlchemyUnitOfWork, inventory_dto: InventoryRead):
        """Enrich cost per unit based on the material."""
        from app.domains.process.domain import ProcessDomain

        inventory = uow.inventory_repository.find_one(uuid=inventory_dto.uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError('Inventory not found')


        events = [event for event in inventory.inventory_events if (not event.is_deleted) and event.affect_original]
        if not events:
            inventory_dto.cost_per_unit = 0

        agg_total_costs = []
        for event in events:
            if event.cost_per_unit:
                agg_total_costs.append(event.cost_per_unit * event.quantity)

            elif event.purchase_order_item_uuid:
                purchase_order_item = event.purchase_order_item
                agg_total_costs.append(purchase_order_item.adjusted_price_per_unit * event.quantity)

            elif event.process_uuid:
                process = event.process
                cost_per_unit = ProcessDomain._cost_per_unit_for_output(
                    uow=uow,
                    process=process,
                    output_inventory_uuid=inventory_dto.uuid
                ) or 0
                agg_total_costs.append(cost_per_unit * event.quantity)

        if not agg_total_costs:
            inventory_dto.cost_per_unit = 0

        else:
            inventory_dto.cost_per_unit = sum(agg_total_costs) / sum([event.quantity for event in events])


    @staticmethod
    def get_fifo_inventories_for_material(
        uow: SqlAlchemyUnitOfWork,
        material_uuid: str,
        quantity: float,
        allow_negative: bool = False,
    ) -> list[InventoryFIFOOutput]:
        """Split `quantity` across this material's lots, oldest stock first.

        `allow_negative` decides what happens when the lots do not cover the
        request. Selling is allowed to overdraw — a driver hands over goods the
        books have not caught up with, and refusing the sale loses the record of
        something that physically happened. Production is not: consuming input
        that does not exist would invent output, so the process path leaves this
        off and still gets the old error.

        Whatever the answer, the returned quantities always sum to `quantity` —
        the caller turns each entry into an inventory event, so dropping the
        shortfall here would silently under-deduct stock.
        """
        inventories = uow.inventory_repository.get_fifo_inventories_for_material(
            material_uuid=material_uuid,
            quantity=quantity
        )

        result = []
        remaining_quantity = quantity
        last_drawn_lot = None
        for inventory in inventories:
            if remaining_quantity <= 0:
                break

            if inventory.current_quantity <= 0:
                continue

            if inventory.current_quantity >= remaining_quantity:
                dto = InventoryFIFOOutput(
                    inventory_uuid=inventory.uuid,
                    material_uuid=inventory.material_uuid,
                    quantity=remaining_quantity
                )
                result.append(dto)
                last_drawn_lot = inventory
                remaining_quantity = 0
            else:
                dto = InventoryFIFOOutput(
                    inventory_uuid=inventory.uuid,
                    material_uuid=inventory.material_uuid,
                    quantity=inventory.current_quantity
                )
                result.append(dto)
                last_drawn_lot = inventory
                remaining_quantity -= inventory.current_quantity

        if remaining_quantity > 0:
            if not allow_negative:
                raise NotFoundError(
                    f"Insufficient inventory for material {material_uuid}: "
                    f"requested {quantity}, available {quantity - remaining_quantity}"
                )
            InventoryDomain._absorb_shortfall(
                uow=uow,
                material_uuid=material_uuid,
                shortfall=remaining_quantity,
                last_drawn_lot=last_drawn_lot,
                result=result,
            )

        return result

    @staticmethod
    def _absorb_shortfall(
        uow: SqlAlchemyUnitOfWork,
        material_uuid: str,
        shortfall: float,
        last_drawn_lot,
        result: list[InventoryFIFOOutput],
    ) -> None:
        """Charge the uncovered quantity to one lot, pushing it negative.

        Preference is the lot FIFO stopped on, so the overdraft continues from
        where consumption ran out and stays next to the stock it overdrew. With
        no positive lots at all — everything already at or below zero — it goes
        on the newest lot for the material, so repeated overselling accumulates
        in one place instead of scattering.

        A material with no lot at all is the one case this cannot answer: a lot
        needs a warehouse, and nothing in a sale says which one. That raises,
        because inventing a warehouse would put stock somewhere it never was.
        """
        target = last_drawn_lot
        if target is None:
            target = (
                uow.session.query(InventoryModel)
                .filter(
                    InventoryModel.account_uuid == uow.account_uuid,
                    InventoryModel.material_uuid == material_uuid,
                    InventoryModel.is_deleted == False,  # noqa: E712
                )
                .order_by(InventoryModel.created_at.desc())
                .first()
            )
        if target is None:
            raise BadRequestError(
                f"Cannot record a sale of material {material_uuid}: it has no "
                f"inventory lot, so there is no warehouse to take the stock from. "
                f"Add inventory for it first."
            )

        for dto in result:
            if dto.inventory_uuid == target.uuid:
                dto.quantity += shortfall
                return
        result.append(
            InventoryFIFOOutput(
                inventory_uuid=target.uuid,
                material_uuid=target.material_uuid,
                quantity=shortfall,
            )
        )
