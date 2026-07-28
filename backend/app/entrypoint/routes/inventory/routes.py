from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from app.dto.inventory import (
    InventoryCreate,
    InventoryRead,
    InventoryUpdate,
    InventoryListParams,
    InventoryPage,
    InventoryManualAdd,
)
from models.common import Inventory as InventoryModel
from app.domains.inventory.domain import InventoryDomain
from app.dto.common_enums import Currency
from app.entrypoint.routes.inventory import inventory_blueprint


def _cost_currency_arg():
    """The validated ?cost_currency= query arg, or None for the default."""
    raw = request.args.get('cost_currency')
    if not raw:
        return None
    try:
        return Currency(raw)
    except ValueError:
        raise BadRequestError(
            f"cost_currency must be one of {[c.value for c in Currency]}"
        )

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@inventory_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def create_inventory():
    """Create a new inventory."""
    current_user_uuid = get_jwt_identity()
    payload = InventoryCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        inv_read = InventoryDomain.create_inventory(uow=uow, payload=payload)
        result = inv_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@inventory_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def get_inventory(uuid: str):
    cost_currency = _cost_currency_arg()
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inv:
            raise NotFoundError('Inventory not found')
        result = InventoryRead.from_orm(inv)
        cost_ctx = InventoryDomain.new_cost_context(currency=cost_currency or Currency.SYP)
        InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=result, cost_ctx=cost_ctx)
        result = result.model_dump(mode='json')
        # rates pulled on the spot for missing days should outlive this read
        if cost_ctx["rates_ingested"]:
            uow.commit()
    return jsonify(result), 200
#
@inventory_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def update_inventory(uuid: str):
    payload = InventoryUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inv:
            raise NotFoundError('Inventory not found')
        for field, val in updates.items():
            setattr(inv, field, val)
        uow.inventory_repository.save(model=inv, commit=True)
        result = InventoryRead.from_orm(inv).model_dump(mode='json')
    return jsonify(result), 200

@inventory_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_inventory(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        inv_read = InventoryDomain.delete_inventory(uow=uow, uuid=uuid)
        result = inv_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@inventory_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def list_inventories():
    params = InventoryListParams(**request.args)
    filters = [InventoryModel.is_deleted == False]
    if params.uuid:
        filters.append(InventoryModel.uuid == params.uuid)
    if params.material_uuid:
        filters.append(InventoryModel.material_uuid == params.material_uuid)
    if params.warehouse_uuid:
        filters.append(InventoryModel.warehouse_uuid == params.warehouse_uuid)
    if params.is_active is not None:
        filters.append(InventoryModel.is_active == params.is_active)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.inventory_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        # enrich items with cost per unit
        items = []
        cost_ctx = InventoryDomain.new_cost_context(
            currency=params.cost_currency or Currency.SYP
        )
        for i in page_obj.items:
            dto = InventoryRead.from_orm(i)
            InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=dto, cost_ctx=cost_ctx)
            items.append(dto.model_dump(mode='json'))
        # rates pulled on the spot for missing days should outlive this read
        if cost_ctx["rates_ingested"]:
            uow.commit()
        result = InventoryPage(
            inventories=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200

@inventory_blueprint.route('/manual-add', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def manual_add_inventory():
    """Add stock to a warehouse by hand: creates the lot AND its opening
    manual event in ONE transaction.

    Doing this as two client calls can leave a quantity-less lot behind when
    the second call fails, and such a lot is invisible in every stock view
    (quantity lives only in events) yet still occupies its unique lot_id.
    """
    from app.dto.inventory_event import InventoryEventCreate, InventoryEventType
    from app.domains.inventory_event.domain import InventoryEventDomain

    current_user_uuid = get_jwt_identity()
    payload = InventoryManualAdd(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        # scoped lookups: another tenant's warehouse/material is simply absent
        warehouse = uow.warehouse_repository.find_one(
            uuid=payload.warehouse_uuid, is_deleted=False
        )
        if not warehouse:
            raise NotFoundError("Warehouse not found")

        create = InventoryCreate(
            material_uuid=payload.material_uuid,
            warehouse_uuid=payload.warehouse_uuid,
            notes=payload.notes,
            lot_id=payload.lot_id,
            expiration_date=payload.expiration_date,
        )
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=create)
        # validates the material (scoped) and derives unit from it
        inventory = InventoryDomain.create_inventory(uow=uow, payload=create)

        event = InventoryEventCreate(
            inventory_uuid=inventory.uuid,
            event_type=InventoryEventType.MANUAL.value,
            quantity=payload.quantity,
            notes=payload.notes,
            cost_per_unit=payload.cost_per_unit,
            currency=payload.currency,
            # this IS the lot's opening quantity, so it counts as original
            affect_original=True,
        )
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=event)
        event_read = InventoryEventDomain.create_inventory_event(uow=uow, payload=event)

        result = {
            "inventory": inventory.model_dump(mode="json"),
            "inventory_event": event_read.model_dump(mode="json"),
        }
        uow.commit()
    return jsonify(result), 201



@inventory_blueprint.route('/<string:uuid>/zero-out', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value)
def zero_out_inventory(uuid: str):
    """Write the lot's remaining quantity off to exactly zero.

    The correcting quantity is computed HERE, from the lot's own events, rather
    than taken from the caller: a page that loaded a minute ago may be showing a
    stale figure, and trusting it would leave the lot slightly off — or worse,
    push it the wrong side of zero. A negative lot is corrected upwards by the
    same rule.

    Recorded as a manual event with affect_original=False, so the lot keeps its
    original received quantity for costing and only the current balance moves.
    """
    from app.dto.inventory_event import InventoryEventCreate, InventoryEventType
    from app.domains.inventory_event.domain import InventoryEventDomain

    current_user_uuid = get_jwt_identity()
    notes = (request.json or {}).get('notes') if request.is_json else None

    with SqlAlchemyUnitOfWork() as uow:
        inventory = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError('Inventory not found')

        remaining = inventory.current_quantity or 0
        # 1e-9 rather than == 0: quantities are floats built by summing events
        if abs(remaining) < 1e-9:
            raise BadRequestError('This lot is already at zero')

        event = InventoryEventCreate(
            inventory_uuid=inventory.uuid,
            event_type=InventoryEventType.MANUAL.value,
            quantity=-remaining,
            notes=notes or f'Zeroed out (was {remaining})',
            affect_original=False,
        )
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=event)
        event_read = InventoryEventDomain.create_inventory_event(uow=uow, payload=event)
        uow.commit()

        result = {
            'inventory_uuid': inventory.uuid,
            'lot_id': inventory.lot_id,
            'previous_quantity': remaining,
            'current_quantity': inventory.current_quantity,
            'inventory_event': event_read.model_dump(mode='json'),
        }
    return jsonify(result), 201



# ----------------------- WAREHOUSE INVENTORY ANALYTICS -----------------------
# Stock is the running sum of SIGNED inventory events (purchases/returns are
# positive, sales/process consumption negative) — exactly how
# Inventory.current_quantity is defined, so these aggregates agree with the
# per-lot numbers. The _cached_* columns are NOT used (they are often null).
#
# Raw session queries below bypass repository scoping, so every one filters
# account_uuid explicitly, and events of soft-deleted lots are excluded.

_STATE_SCOPES = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.SALES.value,
    PermissionScope.DRIVER.value,
)


def _inv_parse_dt(value, end_of_day=False):
    from datetime import datetime as _dt, timedelta as _td
    if not value:
        return None
    try:
        parsed = _dt.fromisoformat(value)
    except ValueError:
        raise BadRequestError(f"Invalid date: {value}")
    # a date-only end bound means "through that day", not "up to its midnight"
    if end_of_day and len(value) == 10:
        parsed = parsed + _td(days=1) - _td(microseconds=1)
    return parsed


def _scoped_material_uuids(uow, material_uuids):
    """Keep only materials this tenant owns. The caller supplies these uuids,
    so they must be filtered before they reach ANY query — otherwise another
    tenant's material name/unit could be echoed back in the response."""
    from models.common import Material as MAT
    if not material_uuids:
        return []
    rows = (
        uow.session.query(MAT.uuid)
        .filter(
            MAT.uuid.in_(material_uuids),
            MAT.account_uuid == uow.account_uuid,
            MAT.is_deleted == False,
        )
        .all()
    )
    owned = {r[0] for r in rows}
    return [m for m in material_uuids if m in owned]


def _inv_bucket_arg():
    bucket = request.args.get("bucket", "day")
    if bucket not in ("day", "week", "month"):
        raise BadRequestError("bucket must be day, week or month")
    return bucket


def _warehouse_or_404(uow, warehouse_uuid):
    """Scoped lookup: another tenant's warehouse is simply not found."""
    warehouse = uow.warehouse_repository.find_one(uuid=warehouse_uuid, is_deleted=False)
    if not warehouse:
        raise NotFoundError("Warehouse not found")
    return warehouse


def _material_state_rows(uow, warehouse_uuid, material_uuids=None):
    """Per-material stock in a warehouse: signed-event sum over its lots.

    Aggregated per LOT first, so `lots` can count only the lots still holding
    something — counting emptied lots would overstate what is actually on the
    floor.
    """
    from sqlalchemy import case, func
    from models.common import (
        Inventory as INV,
        InventoryEvent as IE,
        Material as MAT,
    )
    lot_q = (
        uow.session.query(
            INV.material_uuid.label("material_uuid"),
            INV.uuid.label("lot_uuid"),
            func.coalesce(func.sum(IE.quantity), 0).label("lot_qty"),
            func.max(IE.created_at).label("last_event_at"),
        )
        .select_from(IE)
        .join(INV, INV.uuid == IE.inventory_uuid)
        .filter(
            IE.account_uuid == uow.account_uuid,
            IE.is_deleted == False,
            INV.is_deleted == False,
            INV.warehouse_uuid == warehouse_uuid,
        )
    )
    if material_uuids:
        lot_q = lot_q.filter(INV.material_uuid.in_(material_uuids))
    lot_sq = lot_q.group_by(INV.material_uuid, INV.uuid).subquery()

    return (
        uow.session.query(
            MAT.uuid,
            MAT.name,
            MAT.sku,
            MAT.measure_unit,
            func.coalesce(func.sum(lot_sq.c.lot_qty), 0).label("quantity"),
            func.count(
                case((func.abs(lot_sq.c.lot_qty) > 1e-9, lot_sq.c.lot_uuid))
            ).label("lots"),
            func.max(lot_sq.c.last_event_at).label("last_event_at"),
        )
        .select_from(lot_sq)
        .join(MAT, MAT.uuid == lot_sq.c.material_uuid)
        .filter(
            MAT.account_uuid == uow.account_uuid,
            MAT.is_deleted == False,
        )
        .group_by(MAT.uuid, MAT.name, MAT.sku, MAT.measure_unit)
        .all()
    )


@inventory_blueprint.route("/analytics/warehouse-state", methods=["GET"])
@jwt_required()
@scopes_required(*_STATE_SCOPES)
def inventory_warehouse_state():
    """Current stock per material for one warehouse (all materials that ever
    moved through it). Lots counted are the lots the material occupies."""
    warehouse_uuid = request.args.get("warehouse_uuid")
    if not warehouse_uuid:
        raise BadRequestError("warehouse_uuid is required")
    include_empty = request.args.get("include_empty", "false").lower() == "true"

    with SqlAlchemyUnitOfWork() as uow:
        _warehouse_or_404(uow, warehouse_uuid)
        rows = _material_state_rows(uow, warehouse_uuid)
        items = [
            {
                "material_uuid": m_uuid,
                "material_name": name,
                "sku": sku,
                "unit": unit,
                "quantity": round(float(qty or 0), 3),
                "lots": int(lots or 0),
                "last_event_at": last.isoformat() if last else None,
            }
            for m_uuid, name, sku, unit, qty, lots, last in rows
        ]
        # a material whose stock nets to zero is not "current inventory"
        if not include_empty:
            items = [i for i in items if abs(i["quantity"]) > 1e-9]
        items.sort(key=lambda i: i["quantity"], reverse=True)
        result = {"items": items, "total_count": len(items)}
    return jsonify(result), 200


@inventory_blueprint.route("/analytics/warehouse-over-time", methods=["GET"])
@jwt_required()
@scopes_required(*_STATE_SCOPES)
def inventory_warehouse_over_time():
    """Stock level over time per material for one warehouse.

    Returns, per material, a `baseline` (net stock before the window) plus the
    net `delta` per bucket; the caller accumulates them into a level. Series
    are never summed across materials — units differ (kg vs pieces), so a
    combined total would be meaningless.
    """
    from sqlalchemy import func
    from models.common import (
        Inventory as INV,
        InventoryEvent as IE,
    )
    warehouse_uuid = request.args.get("warehouse_uuid")
    if not warehouse_uuid:
        raise BadRequestError("warehouse_uuid is required")
    bucket = _inv_bucket_arg()
    start = _inv_parse_dt(request.args.get("start_date"))
    end = _inv_parse_dt(request.args.get("end_date"), end_of_day=True)
    raw_materials = request.args.get("material_uuids")
    material_uuids = [m for m in raw_materials.split(",") if m] if raw_materials else []
    if len(material_uuids) > 50:
        raise BadRequestError("material_uuids accepts at most 50 materials")
    try:
        top_n = int(request.args.get("top_n", 5))
    except ValueError:
        raise BadRequestError("top_n must be an integer")
    top_n = max(1, min(top_n, 20))

    with SqlAlchemyUnitOfWork() as uow:
        _warehouse_or_404(uow, warehouse_uuid)

        # never let caller-supplied uuids through unscoped — they end up in the
        # response as material names/units
        material_uuids = _scoped_material_uuids(uow, material_uuids)

        state = _material_state_rows(uow, warehouse_uuid, material_uuids or None)
        # with no explicit selection, chart the biggest stock holders so the
        # section is useful on first open instead of empty. Rank by SIGNED
        # quantity to match the table's order: a large negative balance is a
        # data problem to fix, not "the material with the most stock".
        if not material_uuids:
            ranked = sorted(
                [r for r in state if abs(float(r[4] or 0)) > 1e-9],
                key=lambda r: float(r[4] or 0),
                reverse=True,
            )
            material_uuids = [r[0] for r in ranked[:top_n]]
        if not material_uuids:
            return jsonify({"bucket": bucket, "series": []}), 200

        # labels come from the scoped state rows, not a fresh unscoped lookup
        names = {r[0]: r[1] for r in state}
        units = {r[0]: r[3] for r in state}

        base_filters = [
            IE.account_uuid == uow.account_uuid,
            IE.is_deleted == False,
            INV.is_deleted == False,
            INV.warehouse_uuid == warehouse_uuid,
            INV.material_uuid.in_(material_uuids),
        ]

        # net stock before the window, per material — the level the first
        # bucket builds on (without it the chart starts at zero and lies)
        baselines = {}
        if start:
            for m_uuid, total in (
                uow.session.query(
                    INV.material_uuid, func.coalesce(func.sum(IE.quantity), 0)
                )
                .select_from(IE)
                .join(INV, INV.uuid == IE.inventory_uuid)
                .filter(*base_filters, IE.created_at < start)
                .group_by(INV.material_uuid)
                .all()
            ):
                baselines[m_uuid] = round(float(total or 0), 3)

        expr = func.date_trunc(bucket, IE.created_at)
        q = (
            uow.session.query(
                INV.material_uuid,
                expr.label("period"),
                func.coalesce(func.sum(IE.quantity), 0).label("delta"),
            )
            .select_from(IE)
            .join(INV, INV.uuid == IE.inventory_uuid)
            .filter(*base_filters)
        )
        if start:
            q = q.filter(IE.created_at >= start)
        if end:
            q = q.filter(IE.created_at <= end)
        rows = q.group_by(INV.material_uuid, expr).order_by(expr).all()

        by_material = {m: [] for m in material_uuids}
        for m_uuid, period, delta in rows:
            by_material.setdefault(m_uuid, []).append(
                {"period": period.isoformat(), "delta": round(float(delta or 0), 3)}
            )
        series = [
            {
                "material_uuid": m,
                "material_name": names.get(m),
                "unit": units.get(m),
                "baseline": baselines.get(m, 0.0),
                "buckets": by_material.get(m, []),
            }
            for m in material_uuids
        ]
        result = {"bucket": bucket, "series": series}
    return jsonify(result), 200
