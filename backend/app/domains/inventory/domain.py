from datetime import datetime

from app.dto.inventory import InventoryRead
from models.common import Inventory as InventoryModel
from app.dto.inventory import InventoryCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError


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
