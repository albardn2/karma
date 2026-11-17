from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.warehouse import WarehouseRead
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError

# a lot below this is empty; balances are summed floats
EMPTY_LOT = 1e-9


class WarehouseDomain:
    @staticmethod
    def delete_warehouse(uow: SqlAlchemyUnitOfWork, uuid: str) -> WarehouseRead:
        """Soft-delete a warehouse once nothing is left in it.

        Lots that are at zero do not block it: they keep their history and stay
        readable. A lot that still holds stock does, since that stock would be left
        in a warehouse no one can open; zero it out or move it first.
        """
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            raise NotFoundError("Warehouse not found")
        holding = [
            lot for lot in uow.inventory_repository.find_all(warehouse_uuid=wh.uuid, is_deleted=False)
            if abs(lot.current_quantity) > EMPTY_LOT
        ]
        if holding:
            raise BadRequestError(
                f"This warehouse still holds stock in {len(holding)} lot(s). "
                "Zero them out or move the stock before deleting it."
            )
        wh.is_deleted = True
        uow.warehouse_repository.save(model=wh, commit=False)
        return WarehouseRead.from_orm(wh)
