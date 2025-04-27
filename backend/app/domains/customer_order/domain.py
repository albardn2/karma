from datetime import datetime

from app.dto.customer_order import CustomerOrderCreate,CustomerOrderRead,CustomerOrderUpdate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import CustomerOrder as CustomerOrderModel
from app.entrypoint.routes.common.errors import NotFoundError


class CustomerOrderDomain:


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
        # fetch existing order
        order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not order:
            raise NotFoundError("CustomerOrder not found")

        #TODO: delete all related items
        order.is_deleted = True
        uow.customer_order_repository.save(model=order, commit=False)
        result = CustomerOrderRead.from_orm(order)
        return result