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

    # Frozen once a material is in use, because existing rows would silently
    # change meaning: quantities and costs already recorded are denominated in
    # measure_unit, and type decides how the material is handled (a PO of a
    # raw_material becomes stock; a product does not).
    #
    # sku is deliberately NOT here. It is a label, not a unit of account: no
    # table stores a copy of it, and every report joins on material_uuid and
    # reads the current value — so correcting a mistyped code re-labels the
    # history rather than misstating it. It stays globally unique, which
    # update_material checks before writing.
    SENSITIVE_UPDATE_FIELDS = [
        'measure_unit',
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

        # Unit, sku and type are frozen once a material is in use — changing
        # them would silently restate existing stock, prices and history. The
        # test is whether the value actually CHANGES, not whether the client
        # mentioned the field: the web form posts the whole material on every
        # save, so keying on presence rejected harmless edits (renaming, or
        # adding a description) for any material that had ever been stocked,
        # priced or ordered — which is nearly all of them.
        # sku is unique across the whole table, so a collision would otherwise
        # surface as an IntegrityError 500 on commit. Checked with a raw query
        # because the constraint is global while the repositories are scoped to
        # one account — a clash with another tenant's code still has to be
        # reported as a clash, not as a server error.
        if 'sku' in data and data['sku'] != m.sku:
            clash = (
                uow.session.query(MaterialModel)
                .filter(
                    MaterialModel.sku == data['sku'],
                    MaterialModel.uuid != m.uuid,
                    MaterialModel.is_deleted == False,  # noqa: E712
                )
                .first()
            )
            if clash:
                raise BadRequestError(f"SKU {data['sku']!r} is already used by another material")

        changed_sensitive = [
            field for field in data
            if field in MaterialDomain.SENSITIVE_UPDATE_FIELDS
            and data[field] != getattr(m, field)
        ]
        if changed_sensitive and not MaterialDomain.validate_no_relation_exists(uow, m):
            raise BadRequestError(
                f"Cannot change {', '.join(sorted(changed_sensitive))} on a material that is "
                f"already in use (it has stock, pricing, orders or history). "
                f"Its name and description can still be edited."
            )

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
            uow.pricing_repository.find_first(material_uuid=m.uuid, is_deleted=False) or
            uow.customer_order_item_repository.find_first(material_uuid=m.uuid, is_deleted=False) or
            uow.inventory_repository.find_first(material_uuid=m.uuid, is_deleted=False) or
            uow.purchase_order_item_repository.find_first(material_uuid=m.uuid, is_deleted=False) or
            uow.fixed_asset_repository.find_first(material_uuid=m.uuid, is_deleted=False) or
            uow.inventory_event_repository.find_first(material_uuid=m.uuid, is_deleted=False)
        ):
            return False
        return True


