from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.material import (
    MaterialCreate,
    MaterialRead,
    MaterialUpdate,
    MaterialListParams,
    MaterialPage
)

from app.entrypoint.routes.common.errors import NotFoundError

from models.common import Material as MaterialModel
from app.entrypoint.routes.common.errors import BadRequestError


class MaterialDomain:

    SENSITIVE_UPDATE_FIELDS = [
        'measure_unit',
        'sku',
        'type'
    ]


    @staticmethod
    def delete_material(uow: SqlAlchemyUnitOfWork, uuid: str) -> MaterialRead:
        m = uow.material_repository.find_one(uuid=uuid,is_deleted=False)
        if not m:
            raise NotFoundError('Material not found')

        if not MaterialDomain.validate_no_relation_exists(uow,m):
            raise BadRequestError('Material cannot be updated because it has relations')

        m.is_deleted = True
        uow.material_repository.save(model=m, commit=False)
        material_data = MaterialRead.from_orm(m)
        return material_data

    @staticmethod
    def update_material(uow: SqlAlchemyUnitOfWork, uuid: str,payload: MaterialUpdate) -> MaterialRead:
        data    = payload.model_dump(exclude_unset=True, mode='json')
        m = uow.material_repository.find_one(uuid=uuid,is_deleted=False)
        if not m:
            raise NotFoundError('Material not found')

        if any(field in MaterialDomain.SENSITIVE_UPDATE_FIELDS for field in data.keys()) and not MaterialDomain.validate_no_relation_exists(uow,m):
            raise BadRequestError('Material cannot be updated because it has relations')

        for field, val in data.items():
            setattr(m, field, val)
        uow.material_repository.save(model=m, commit=False)

        material_data = MaterialRead.from_orm(m)
        return material_data

    @staticmethod
    def validate_no_relation_exists(uow:SqlAlchemyUnitOfWork, m: MaterialModel)->bool:
        """
        Validate that no relation exists for the material.
        """
        # Check if there are any relations
        """
        if any     pricing = relationship("Pricing", back_populates="material", uselist=False)
        customer_order_items = relationship("CustomerOrderItem", back_populates="material")
        inventory = relationship("Inventory", back_populates="material")
        purchase_order_items = relationship("PurchaseOrderItem", back_populates="material")
        fixed_assets = relationship("FixedAsset", back_populates="material")
        inventory_events = relationship("InventoryEvent", back_populates="material")
        """
        if (
            uow.pricing.find_one(material_uuid=m.uuid, is_deleted=False) or
            uow.customer_order_items.find_one(material_uuid=m.uuid, is_deleted=False) or
            uow.inventory.find_one(material_uuid=m.uuid, is_deleted=False) or
            uow.purchase_order_items.find_one(material_uuid=m.uuid, is_deleted=False) or
            uow.fixed_assets.find_one(material_uuid=m.uuid, is_deleted=False) or
            uow.inventory_events.find_one(material_uuid=m.uuid, is_deleted=False)
        ):
            return False
        return True


