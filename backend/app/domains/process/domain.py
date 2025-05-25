from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.process import ProcessCreate, ProcessRead
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import Process as ProcessModel

from app.dto.process import ProcessUpdate

from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory import InventoryCreate
from app.dto.inventory_event import InventoryEventCreate, InventoryEventType
from app.dto.process import ProcessOutputItem, ProcessInputItem
from app.entrypoint.routes.common.errors import BadRequestError

from app.dto.inventory import InventoryRead

from app.domains.inventory.domain import InventoryDomain


class ProcessDomain:

    @staticmethod
    def create_process(uow: SqlAlchemyUnitOfWork, payload: ProcessCreate) -> ProcessRead:
        """Create a process."""
        process = ProcessModel(**payload.model_dump(mode='json'))

        process = ProcessDomain._calculate_cost_per_unit(uow, process)
        uow.process_repository.save(model=process, commit=False)

        # create inventory entry if process doesnt have inventory uuid
        ProcessDomain.create_inventory_entry(uow=uow, process=process)

        # create inventory events from process
        for input in process.data["inputs"]:
            # load
            input = ProcessInputItem(**input)
            InventoryEventDomain.create_inventory_event(
                uow=uow,
                payload=InventoryEventCreate(
                    inventory_uuid=input.inventory_uuid,
                    quantity=-abs(input.quantity),
                    process_uuid=process.uuid,
                    event_type=InventoryEventType.PROCESS.value,
                    affect_original=False,
                ),
            )

        for output in process.data["outputs"]:
            if output["inventory_uuid"] is None:
                raise BadRequestError("Output inventory uuid is None")

            ProcessDomain.validate_inventory_material(uow=uow, inventory_uuid=output["inventory_uuid"], material_uuid=output["material_uuid"])
            # load output to dto
            output = ProcessOutputItem(**output)
            InventoryEventDomain.create_inventory_event(
                uow=uow,
                payload=InventoryEventCreate(
                    inventory_uuid=output.inventory_uuid,
                    quantity=abs(output.quantity),
                    process_uuid=process.uuid,
                    event_type=InventoryEventType.PROCESS.value,
                    affect_original=True,
                ),
            )


        return ProcessRead.from_orm(process)

    @staticmethod
    def update_process(uow: SqlAlchemyUnitOfWork, uuid:str, payload:ProcessUpdate) -> ProcessRead:
        process = uow.process_repository.find_one(uuid=uuid, is_deleted=False)
        if not process:
            raise NotFoundError("Process not found")
        for k, v in payload.model_dump(exclude_unset=True, mode="json").items():
            setattr(process, k, v)
        process = ProcessDomain._calculate_cost_per_unit(uow, process)
        uow.process_repository.save(model=process, commit=False)
        return ProcessRead.from_orm(process)


    @staticmethod
    def delete_process(uow, uuid):
        """Delete a process."""
        process = uow.process_repository.find_one(uuid=uuid, is_deleted=False)
        if not process:
            raise NotFoundError("Process not found")

        # delete inventory events
        for event in process.inventory_events:
            InventoryEventDomain.delete_inventory_event(uow=uow, uuid=event.uuid)
        # delete inventory entries
        for output in process.data["outputs"]:
            if output.get("inventory_uuid"):
                InventoryDomain.delete_inventory(uow=uow, uuid=output["inventory_uuid"])

        process.is_deleted = True
        uow.process_repository.save(model=process, commit=False)
        return ProcessRead.from_orm(process)


    @staticmethod
    def _cost_per_unit_for_output(
        uow: SqlAlchemyUnitOfWork,
        process: ProcessModel,
        output_inventory_uuid: str,
    ) -> float:
        """Calculate cost per unit for output."""
        process = ProcessDomain._calculate_cost_per_unit(uow, process)
        for output in process.data["outputs"]:
            if output["inventory_uuid"] == output_inventory_uuid:
                return output["cost_per_unit"]


    @staticmethod
    def _calculate_cost_per_unit(uow, process: ProcessModel) -> ProcessModel:
        """Convert process data from model to dict."""
        # prevent circular import
        cost_per_unit_mapper = {}
        for input in process.data["inputs"]:
            input_inventory = uow.inventory_repository.find_one(uuid=input["inventory_uuid"],is_deleted=False) #uow.inventory_repository.find_one(uuid=input.inventory_uuid, is_deleted=False)
            if not input_inventory:
                raise NotFoundError(f"Inventory with uuid {input['inventory_uuid']} not found") #raise NotFoundError(f"Inventory with uuid {input.inventory_uuid} not found")

            input_inventory_dto = InventoryRead.from_orm(input_inventory)
            InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=input_inventory_dto)

            cost_per_unit_mapper[input["inventory_uuid"]] = input_inventory_dto.cost_per_unit
            input["cost_per_unit"] = cost_per_unit_mapper[input["inventory_uuid"]]


        for output in process.data["outputs"]:
            output_material = uow.material_repository.find_one(uuid=output["material_uuid"],is_deleted=False) #uow.material_repository.find_one(uuid=output.material_uuid, is_deleted=False)
            if not output_material:
                raise NotFoundError(f"Material with uuid {output['material_uuid']} not found") #raise NotFoundError(f"Material with uuid {output.material_uuid} not found")

            total_cost = 0
            for input_used in output["inputs_used"]:
                total_cost += cost_per_unit_mapper[input_used["inventory_uuid"]] * input_used["quantity"]
            output["total_cost"] = total_cost
            output["cost_per_unit"] = total_cost / output["quantity"] if output["quantity"] else 0

        return process

    @staticmethod
    def create_inventory_entry(uow: SqlAlchemyUnitOfWork, process: ProcessModel) -> None:
        """Create an inventory entry for the process."""
        for output in process.data["outputs"]:
            if not output.get("inventory_uuid"):
                material = uow.material_repository.find_one(uuid=output["material_uuid"], is_deleted=False)
                payload = InventoryCreate(
                    material_uuid=output["material_uuid"],
                    warehouse_uuid= process.data.get("output_warehouse_uuid"),
                )
                inv_read = InventoryDomain.create_inventory(
                    uow=uow,
                    payload=payload,
                )
                output["inventory_uuid"] = inv_read.uuid

    @staticmethod
    def validate_inventory_material(
        uow: SqlAlchemyUnitOfWork,
        inventory_uuid: str,
        material_uuid: str,
    ) -> None:
        """Validate that the inventory and material match."""
        existing_inventory = uow.inventory_repository.find_one(uuid=inventory_uuid, is_deleted=False)
        if not existing_inventory:
            raise NotFoundError("Inventory not found")
        if existing_inventory.material_uuid != material_uuid:
            raise BadRequestError("Material not found in inventory")
