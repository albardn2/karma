import time

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
from app.dto.process import InputsUsedItem
from sqlalchemy.orm.attributes import flag_modified
from app.dto.process import ProcessData
from app.dto.inventory import InventoryFIFOOutput


class ProcessDomain:

    @staticmethod
    def create_process(uow: SqlAlchemyUnitOfWork, payload: ProcessCreate) -> ProcessRead:
        """Create a process."""

        payload = ProcessDomain.fifo_derive_inventory_uuids_from_materials(uow,payload)
        payload = ProcessDomain.distribute_inputs_used(payload)

        print(payload.data)

        process = ProcessModel(**payload.model_dump(mode='json'))
        process = ProcessDomain._calculate_cost_per_unit(uow, process)
        uow.process_repository.save(model=process, commit=False)

        # create inventory entry if process doesnt have inventory uuid
        ProcessDomain.create_inventory_entry(uow=uow, process=process)

        # create inventory events from process
        for input in process.data["inputs"]:
            input_inventory= uow.inventory_repository.find_one(uuid=input["inventory_uuid"], is_deleted=False)
            if not input_inventory:
                raise NotFoundError(f"Inventory with uuid {input['inventory_uuid']} not found")
            input["material_uuid"] = input_inventory.material_uuid
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
        flag_modified(process, "data")

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
    def add_process_input(
        uow: SqlAlchemyUnitOfWork,
        process_uuid: str,
        input_data: ProcessInputItem,
    ):
        process = uow.process_repository.find_one(uuid=process_uuid, is_deleted=False)
        if not process:
            raise NotFoundError("Process not found")

        # add input to process data
        process.data["inputs"].append(input_data.model_dump(mode="json"))
        for output in process.data["outputs"]:
            input_used = InputsUsedItem(
                inventory_uuid=input_data.inventory_uuid,
                quantity=input_data.quantity / len(process.data["outputs"]),
            )
            output["inputs_used"].append(input_used.model_dump(mode="json"))

        process = ProcessDomain._calculate_cost_per_unit(uow, process)

        InventoryEventDomain.create_inventory_event(
            uow=uow,
            payload=InventoryEventCreate(
                inventory_uuid=input_data.inventory_uuid,
                quantity=-abs(input_data.quantity),
                process_uuid=process_uuid,
                event_type=InventoryEventType.PROCESS.value,
                affect_original=False,
            ),
        )
        print(process.data)
        #load process data for validation
        ProcessData(**process.data)
        flag_modified(process, "data")
        uow.process_repository.save(model=process, commit=False)

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
            time.sleep(1)  # Sleep to ensure the inventory is created before the next operation

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


    @staticmethod
    def fifo_derive_inventory_uuids_from_materials(uow:SqlAlchemyUnitOfWork,payload: ProcessCreate) -> ProcessCreate:
        """Derive inventory uuids from materials for inputs."""
        inputs = []

        for input in payload.data.inputs:
            material_uuid = input.material_uuid
            quantity = input.quantity
            inventories: list[InventoryFIFOOutput] = InventoryDomain.get_fifo_inventories_for_material(
                uow=uow,
                material_uuid=material_uuid,
                quantity=abs(quantity)
            )
            for inventory in inventories:
                input_item = ProcessInputItem(
                    material_uuid=inventory.material_uuid,
                    quantity=inventory.quantity,
                    inventory_uuid=inventory.inventory_uuid,
                )
                inputs.append(input_item)

        payload.data.inputs = inputs
        return payload

    @staticmethod
    def distribute_inputs_used(payload: ProcessCreate) -> ProcessCreate:
        total_output_quantity = sum(output.quantity for output in payload.data.outputs)
        if total_output_quantity == 0:
            raise BadRequestError("No outputs defined in process data")

        for output in payload.data.outputs:
            output.inputs_used = []
            proportion = output.quantity / total_output_quantity
            for input in payload.data.inputs:
                quantity_used = input.quantity * proportion
                input_used = InputsUsedItem(
                    inventory_uuid=input.inventory_uuid,
                    quantity=quantity_used,
                )
                output.inputs_used.append(input_used)

        return payload


