from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.process import ProcessCreate, ProcessRead
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import Process as ProcessModel

from app.dto.process import ProcessUpdate


class ProcessDomain:

    @staticmethod
    def create_process(uow: SqlAlchemyUnitOfWork, payload: ProcessCreate) -> ProcessRead:
        """Create a process."""
        process = ProcessModel(**payload.model_dump(mode='json'))

        print(process.data["inputs"])

        process = ProcessDomain._process_data_from_model(uow, process)
        uow.process_repository.save(model=process, commit=False)
        return ProcessRead.from_orm(process)

    @staticmethod
    def update_process(uow: SqlAlchemyUnitOfWork, uuid:str, payload:ProcessUpdate) -> ProcessRead:
        process = uow.process_repository.find_one(uuid=uuid, is_deleted=False)
        if not process:
            raise NotFoundError("Process not found")
        for k, v in payload.model_dump(exclude_unset=True, mode="json").items():
            setattr(process, k, v)
        process = ProcessDomain._process_data_from_model(uow, process)
        uow.process_repository.save(model=process, commit=False)
        return ProcessRead.from_orm(process)


    @staticmethod
    def delete_process(uow, uuid):
        """Delete a process."""
        process = uow.process_repository.find_one(uuid=uuid, is_deleted=False)
        if not process:
            raise NotFoundError("Process not found")
        process.is_deleted = True
        uow.process_repository.save(model=process, commit=False)
        return ProcessRead.from_orm(process)


    @staticmethod
    def _process_data_from_model(uow, process: ProcessModel) -> dict:
        """Convert process data from model to dict."""
        cost_per_unit_mapper = {}
        for input in process.data["inputs"]:
            input_inventory = uow.inventory_repository.find_one(uuid=input["inventory_uuid"],is_deleted=False) #uow.inventory_repository.find_one(uuid=input.inventory_uuid, is_deleted=False)
            if not input_inventory:
                raise NotFoundError(f"Inventory with uuid {input['inventory_uuid']} not found") #raise NotFoundError(f"Inventory with uuid {input.inventory_uuid} not found")
            cost_per_unit_mapper[input["inventory_uuid"]] = input_inventory.cost_per_unit
            input["cost_per_unit"] = cost_per_unit_mapper[input["inventory_uuid"]]


        for output in process.data["outputs"]:
            output_material = uow.material_repository.find_one(uuid=output["material_uuid"],is_deleted=False) #uow.material_repository.find_one(uuid=output.material_uuid, is_deleted=False)
            if not output_material:
                raise NotFoundError(f"Material with uuid {output['material_uuid']} not found") #raise NotFoundError(f"Material with uuid {output.material_uuid} not found")

            total_cost = 0
            for input_used in output["inputs_used"]:
                total_cost += cost_per_unit_mapper[input_used["inventory_uuid"]] * input_used["quantity"]
            output["total_cost"] = total_cost

        return process


