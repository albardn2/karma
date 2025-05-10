from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.fixed_asset import FixedAssetCreate, FixedAssetRead, FixedAssetUpdate, FixedAssetListParams, FixedAssetPage
from models.common import FixedAsset as FixedAssetModel
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError


class FixedAssetDomain:
    @staticmethod
    def create_fixed_asset(uow: SqlAlchemyUnitOfWork, payload: FixedAssetCreate) -> FixedAssetRead:

        if payload.purchase_order_item_uuid and (payload.quantity or payload.price_per_unit):
            raise BadRequestError('Cannot provide quantity or price_per_unit when using purchase_order_item_uuid')


        if not payload.purchase_order_item_uuid and not (payload.quantity and payload.price_per_unit):
            raise BadRequestError('Either purchase_order_item_uuid or both quantity and price_per_unit must be provided')

        poi = None
        if payload.purchase_order_item_uuid:
            poi = uow.purchase_order_item_repository.find_one(uuid=payload.purchase_order_item_uuid,is_deleted=False)
            if not poi:
                raise NotFoundError('PurchaseOrderItem not found')
        material = None
        if payload.material_uuid:
            material = uow.material_repository.find_one(uuid=payload.material_uuid,is_deleted=False)
            if not material:
                raise NotFoundError('Material not found')
        if not poi and not material:
            raise BadRequestError('Either PurchaseOrderItem or Material UUID must be provided')
        if (poi and material) and (poi.material_uuid != material.uuid):
            raise BadRequestError('Material UUID does not match with PurchaseOrderItem UUID')

        data = payload.model_dump(mode='json')
        fa = FixedAssetModel(**data)
        if not payload.material_uuid:
            fa.material_uuid = poi.material_uuid

        if payload.purchase_order_item_uuid:
            fa.price_per_unit = poi.price_per_unit
            fa.quantity = poi.quantity

        uow.fixed_asset_repository.save(model=fa, commit=False)
        result = FixedAssetRead.from_orm(fa)
        return result
