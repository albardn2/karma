import math
from datetime import datetime, timedelta
from flask import  request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from geoalchemy2 import WKTElement
from pydantic import  ValidationError
from sqlalchemy import func, select

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.customer import customer_blueprint

from app.dto.customer import CustomerCreate, CustomerRead
from app.utils.geom_utils import lat_lon_to_wkt
from models.common import Customer as CustomerModel

from app.dto.customer import CustomerUpdate, CustomerReadList,CustomerListParams, CustomerPage
from app.dto.customer import (
    MAX_MAP_POINTS,
    CustomerMapCluster,
    CustomerMapClusterPage,
    CustomerMapClusterParams,
)
from app.entrypoint.routes.common.errors import BadRequestError
from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.customer import CustomerCategory
from app.dto.trip_stop import TripStopStatus
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload



@customer_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def create_customer():
    current_uuid = get_jwt_identity()
    payload = CustomerCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_uuid, payload=payload)
        if payload.email_address and uow.customer_repository.find_one(email_address=payload.email_address):
            raise BadRequestError(f"Customer with email {payload.email_address} already exists")

        cust = CustomerModel(**payload.model_dump())
        uow.customer_repository.save(model=cust, commit=True)
        customer_data = CustomerRead.from_orm(cust).model_dump(mode='json')

    return jsonify(customer_data), 201


@customer_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value)
def get_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid,is_deleted=False)
        if not customer:
            raise NotFoundError('Customer not found')
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')
    return jsonify(customer_data), 200


@customer_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def update_customer(uuid: str):
    payload = CustomerUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True)
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid, is_deleted=False)
        if not customer:
            return NotFoundError("Customer not found")

        if payload.email_address and payload.email_address != customer.email_address:
            if uow.customer_repository.find_one(email_address=payload.email_address):
                raise BadRequestError(f"Customer with email {payload.email_address} already exists")
        # Update customer fields
        for key, value in data.items():
            if hasattr(customer, key):
                setattr(customer, key, value)
        uow.customer_repository.save(model=customer, commit=True)
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')

    return jsonify(customer_data), 200


@customer_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid, is_deleted=False)
        if not customer:
            raise NotFoundError("Customer not found")

        customer_orders = uow.customer_order_repository.find_all(uuid=uuid, is_deleted=False)
        if customer_orders:
            raise BadRequestError("Customer has orders and cannot be deleted")
        debit_note_items = uow.debit_note_item_repository.find_all(uuid=uuid, is_deleted=False)
        if debit_note_items:
            raise BadRequestError("Customer has debit notes and cannot be deleted")
        credit_note_items = uow.credit_note_item_repository.find_all(uuid=uuid, is_deleted=False)
        if credit_note_items:
            raise BadRequestError("Customer has credit notes and cannot be deleted")
        for k,v in customer.balance_per_currency.items():
            if v > 0:
                raise BadRequestError("Customer has balance and cannot be deleted")

        customer.is_deleted = True
        uow.customer_repository.save(model=customer, commit=True)
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')

    return jsonify(customer_data), 200


@customer_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value)
def list_customers():
    # Parse & validate pagination params
    params = CustomerListParams(**request.args)
    filters = [CustomerModel.is_deleted == False]
    if params.uuid:
        filters.append(CustomerModel.uuid == params.uuid)
    if params.category:
        filters.append(CustomerModel.category == params.category.value)
    if params.email_address:
        #like
        filters.append(CustomerModel.email_address.ilike(f"%{params.email_address}%"))
    if params.company_name:
        filters.append(CustomerModel.company_name.ilike(f"%{params.company_name}%"))
    if params.full_name:
        filters.append(CustomerModel.full_name.ilike(f"%{params.full_name}%"))
    if params.phone_number:
        filters.append(CustomerModel.phone_number.ilike(f"%{params.phone_number}%"))
    if params.within_polygon:
        try:
            # Wrap your WKT string in a WKTElement (with the correct SRID)
            poly = WKTElement(
                params.within_polygon,
                srid=CustomerModel.coordinates.type.srid  # e.g. 4326
            )
            # Add the ST_Within filter
            filters.append(
                # call the ST_Within comparator
                # coordinates cannot be None
                CustomerModel.coordinates.ST_Within(poly)  # type: ignore[call-overload,attr-defined]

            )
            filters.append(CustomerModel.coordinates.is_not(None))  # ensure coordinates are not None
            # bump per_page so your polygon filter returns everything
            params.per_page = 10000
        except ValidationError as e:
            raise BadRequestError(f"Invalid polygon: {e}")
    if params.within_polygon:
        # make per page a very high number to avoid pagination
        params.per_page = 10000

    # default ordering: most recently added first
    ordering = [CustomerModel.created_at.desc()]
    if params.near:
        # Order nearest-first relative to the reference point. Customers with
        # no saved location can't have a distance, so exclude them.
        point = WKTElement(
            lat_lon_to_wkt(params.near),  # raises BadRequestError if malformed
            srid=CustomerModel.coordinates.type.srid,  # e.g. 4326
        )
        filters.append(CustomerModel.coordinates.is_not(None))
        # ST_DistanceSphere returns true great-circle metres. Plain ST_Distance
        # on a SRID-4326 *geometry* measures planar degrees, which over-weights
        # east-west offsets (1 deg lon << 1 deg lat away from the equator) and
        # can mis-rank the nearest customers.
        ordering = [func.ST_DistanceSphere(CustomerModel.coordinates, point).asc()]

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.customer_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
            ordering=ordering
        )
        items = [
            CustomerRead.from_orm(c).model_dump(mode='json')
            for c in page_obj.items
        ]
        result = CustomerPage(
            customers=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200


@customer_blueprint.route('/categories', methods=['GET'])
def list_customer_categories():
    categories = [category.value for category in CustomerCategory]
    return jsonify(categories), 200


# ----------------------- CUSTOMER ANALYTICS -----------------------
# Read-only aggregates for the Customers > Analytics tab. Raw session
# queries here MUST scope by uow.account_uuid (they bypass the repos).

def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise BadRequestError(f"Invalid date: {value}")


def _csv_arg(name):
    raw = request.args.get(name)
    return [v for v in raw.split(",") if v] if raw else []


def _bucket_arg():
    bucket = request.args.get("bucket", "day")
    if bucket not in ("day", "week", "month"):
        raise BadRequestError("bucket must be day, week or month")
    return bucket


def _int_arg(name, default, minimum, maximum=None):
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except ValueError:
        raise BadRequestError(f"{name} must be an integer")
    if value < minimum:
        raise BadRequestError(f"{name} must be >= {minimum}")
    return min(value, maximum) if maximum is not None else value


def _like_escape(value):
    """Treat user input as a literal: % and _ are wildcards in LIKE."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _sales_join(uow, start, end, material_uuids):
    """Base query joining orders -> items -> invoice items -> invoice (revenue
    rows), filtered by window + materials. Amount = price_per_unit * quantity.
    The invoice join matters: soft-deleting an invoice does NOT cascade to its
    items, so without it voided invoices would still count as revenue."""
    from models.common import (
        CustomerOrder as CO,
        CustomerOrderItem as COI,
        InvoiceItem as II,
        Invoice as INV,
    )
    q = (
        uow.session.query(CO, COI, II, INV)
        .select_from(CO)
        .join(COI, COI.customer_order_uuid == CO.uuid)
        .join(II, II.customer_order_item_uuid == COI.uuid)
        .join(INV, INV.uuid == II.invoice_uuid)
        .filter(
            CO.account_uuid == uow.account_uuid,
            CO.is_deleted == False,
            COI.is_deleted == False,
            II.is_deleted == False,
            INV.is_deleted == False,
        )
    )
    if start:
        q = q.filter(CO.created_at >= start)
    if end:
        q = q.filter(CO.created_at <= end)
    if material_uuids:
        q = q.filter(COI.material_uuid.in_(material_uuids))
    return q, CO, COI, II, INV


@customer_blueprint.route("/analytics/new-customers", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def analytics_new_customers():
    bucket = _bucket_arg()
    start = _parse_dt(request.args.get("start_date"))
    end = _parse_dt(request.args.get("end_date"))
    with SqlAlchemyUnitOfWork() as uow:
        base = [
            CustomerModel.account_uuid == uow.account_uuid,
            CustomerModel.is_deleted == False,
        ]
        expr = func.date_trunc(bucket, CustomerModel.created_at)
        f = list(base)
        if start:
            f.append(CustomerModel.created_at >= start)
        if end:
            f.append(CustomerModel.created_at <= end)
        rows = (
            uow.session.query(expr, func.count(CustomerModel.uuid))
            .filter(*f)
            .group_by(expr)
            .order_by(expr)
            .all()
        )
        # customers that existed before the window: the cumulative baseline
        baseline = 0
        if start:
            baseline = (
                uow.session.query(func.count(CustomerModel.uuid))
                .filter(*base, CustomerModel.created_at < start)
                .scalar()
            )
        result = {
            "buckets": [{"period": p.isoformat(), "count": int(c)} for p, c in rows],
            "baseline": int(baseline or 0),
        }
    return jsonify(result), 200


@customer_blueprint.route("/analytics/customers-sold", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def analytics_customers_sold():
    """Distinct customers with at least one order per bucket, filterable by
    material(s) bought and customer category(ies)."""
    from models.common import (
        CustomerOrder as CO,
        CustomerOrderItem as COI,
    )
    bucket = _bucket_arg()
    start = _parse_dt(request.args.get("start_date"))
    end = _parse_dt(request.args.get("end_date"))
    material_uuids = _csv_arg("material_uuids")
    categories = _csv_arg("categories")
    with SqlAlchemyUnitOfWork() as uow:
        expr = func.date_trunc(bucket, CO.created_at)
        q = (
            uow.session.query(expr, func.count(func.distinct(CO.customer_uuid)))
            .filter(
                CO.account_uuid == uow.account_uuid,
                CO.is_deleted == False,
            )
        )
        if start:
            q = q.filter(CO.created_at >= start)
        if end:
            q = q.filter(CO.created_at <= end)
        # always join the customer so soft-deleted ones are excluded, matching
        # the table and the new-customers chart
        q = q.join(CustomerModel, CustomerModel.uuid == CO.customer_uuid).filter(
            CustomerModel.is_deleted == False
        )
        if categories:
            q = q.filter(CustomerModel.category.in_(categories))
        if material_uuids:
            q = q.join(COI, COI.customer_order_uuid == CO.uuid).filter(
                COI.material_uuid.in_(material_uuids),
                COI.is_deleted == False,
            )
        rows = q.group_by(expr).order_by(expr).all()
        result = {
            "buckets": [{"period": p.isoformat(), "count": int(c)} for p, c in rows]
        }
    return jsonify(result), 200


@customer_blueprint.route("/analytics/sold-customers", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def analytics_sold_customers():
    """Per-customer sales + last-visit table. Revenue is summed across
    currencies for sorting (revenue_total); the per-currency breakdown is
    returned in `revenue`."""
    from math import ceil
    from sqlalchemy import and_, or_
    from models.common import (
        Trip as TR,
        TripStop as TS,
    )
    start = _parse_dt(request.args.get("start_date"))
    end = _parse_dt(request.args.get("end_date"))
    material_uuids = _csv_arg("material_uuids")
    categories = _csv_arg("categories")
    outcome = request.args.get("outcome")
    comments = request.args.get("comments")
    min_days = _int_arg("min_days_since_visit", None, 0)
    only_sold = request.args.get("only_sold", "true").lower() != "false"
    sort_by = request.args.get("sort_by", "revenue")
    if sort_by not in ("revenue", "last_stop", "name"):
        raise BadRequestError("sort_by must be revenue, last_stop or name")
    desc = request.args.get("sort_dir", "desc") != "asc"
    page = _int_arg("page", 1, 1)
    per_page = _int_arg("per_page", 20, 1, 100)

    with SqlAlchemyUnitOfWork() as uow:
        sales_q, CO, COI, II, INV = _sales_join(uow, start, end, material_uuids)
        rev_sq = (
            sales_q.with_entities(
                CO.customer_uuid.label("customer_uuid"),
                func.sum(II.price_per_unit * COI.quantity).label("revenue"),
                func.count(func.distinct(CO.uuid)).label("orders_count"),
            )
            .group_by(CO.customer_uuid)
            .subquery()
        )
        # latest ACTUAL visit per customer: stops on deleted trips are excluded,
        # and so are stops that never happened — a stop still 'planned' (or
        # cancelled) is a future intention, not a visit, and counting it would
        # silently reset "days since last visit" the moment a stop is queued.
        rn = func.row_number().over(
            partition_by=TS.customer_uuid, order_by=TS.created_at.desc()
        ).label("rn")
        stops_sq = (
            uow.session.query(
                TS.customer_uuid.label("customer_uuid"),
                TS.created_at.label("last_stop_date"),
                TS.outcome.label("last_outcome"),
                TS.notes.label("last_notes"),
                rn,
            )
            .join(TR, TR.uuid == TS.trip_uuid)
            .filter(
                TS.account_uuid == uow.account_uuid,
                TR.is_deleted == False,
                TS.customer_uuid.isnot(None),
                TS.status.notin_(
                    [TripStopStatus.PLANNED.value, TripStopStatus.CANCELLED.value]
                ),
            )
            .subquery()
        )
        q = (
            uow.session.query(
                CustomerModel,
                rev_sq.c.revenue,
                rev_sq.c.orders_count,
                stops_sq.c.last_stop_date,
                stops_sq.c.last_outcome,
                stops_sq.c.last_notes,
            )
            .outerjoin(rev_sq, rev_sq.c.customer_uuid == CustomerModel.uuid)
            .outerjoin(
                stops_sq,
                and_(
                    stops_sq.c.customer_uuid == CustomerModel.uuid,
                    stops_sq.c.rn == 1,
                ),
            )
            .filter(
                CustomerModel.account_uuid == uow.account_uuid,
                CustomerModel.is_deleted == False,
            )
        )
        if categories:
            q = q.filter(CustomerModel.category.in_(categories))
        if only_sold:
            q = q.filter(rev_sq.c.revenue.isnot(None))
        if outcome:
            q = q.filter(
                stops_sq.c.last_outcome.ilike(f"{_like_escape(outcome)}%", escape="\\")
            )
        if comments:
            q = q.filter(
                stops_sq.c.last_notes.ilike(f"%{_like_escape(comments)}%", escape="\\")
            )
        if min_days is not None:
            cutoff = datetime.utcnow() - timedelta(days=min_days)
            q = q.filter(
                or_(
                    stops_sq.c.last_stop_date <= cutoff,
                    stops_sq.c.last_stop_date.is_(None),
                )
            )
        if sort_by == "last_stop":
            col = stops_sq.c.last_stop_date
            q = q.order_by(col.desc().nullslast() if desc else col.asc().nullsfirst())
        elif sort_by == "name":
            col = CustomerModel.company_name
            q = q.order_by(col.desc() if desc else col.asc())
        else:
            col = func.coalesce(rev_sq.c.revenue, 0)
            q = q.order_by(col.desc() if desc else col.asc(), CustomerModel.company_name.asc())

        total = q.count()
        rows = q.limit(per_page).offset((page - 1) * per_page).all()

        # per-currency revenue for just this page's customers
        cust_uuids = [c.uuid for c, *_ in rows]
        cur_map: dict = {}
        if cust_uuids:
            cur_q, CO2, COI2, II2, INV2 = _sales_join(uow, start, end, material_uuids)
            cur_rows = (
                cur_q.filter(CO2.customer_uuid.in_(cust_uuids))
                .with_entities(
                    CO2.customer_uuid,
                    INV2.currency,
                    func.sum(II2.price_per_unit * COI2.quantity),
                )
                .group_by(CO2.customer_uuid, INV2.currency)
                .all()
            )
            for cu, cur, amt in cur_rows:
                cur_map.setdefault(cu, {})[cur] = round(float(amt or 0), 2)

        now = datetime.utcnow()
        items = [
            {
                "uuid": c.uuid,
                "company_name": c.company_name,
                "full_name": c.full_name,
                "category": c.category,
                "revenue": cur_map.get(c.uuid, {}),
                "revenue_total": round(float(rev or 0), 2),
                "orders_count": int(oc or 0),
                "last_stop_date": lsd.isoformat() if lsd else None,
                "last_stop_outcome": lo,
                "last_stop_notes": ln,
                "days_since_visit": (now - lsd).days if lsd else None,
            }
            for c, rev, oc, lsd, lo, ln in rows
        ]
        result = {
            "items": items,
            "total_count": total,
            "page": page,
            "per_page": per_page,
            "pages": ceil(total / per_page) if total else 0,
        }
    return jsonify(result), 200


# Target whole cells across the viewport's longer axis. 9 leaves room for the two
# partial cells at the edges and still fits inside MAX_MAP_POINTS (10 x 10).
MAP_CELLS_PER_AXIS = 9


def grid_cell_degrees(span_degrees: float, cells_per_axis: int = MAP_CELLS_PER_AXIS) -> float:
    """Side length, in degrees, of the grid cell used to group map pins.

    Two properties matter, and both come from the arithmetic rather than from a
    LIMIT that would silently drop customers off the map.

    BOUNDED OUTPUT. `k = floor(log2(360 / target))` gives `2**k <= 360 / target`,
    hence `cell = 360 / 2**k >= target = span / cells_per_axis`. So a viewport
    spans at most `cells_per_axis` whole cells per axis, plus at most one more
    where the edges fall mid-cell: at most 10 x 10 = 100 non-empty cells for the
    default 9. That is the "max 100 points" guarantee, and it holds for every
    viewport rather than on average.

    STABLE UNDER PANNING. The size is quantised to a power-of-two fraction of 360
    and the grid is anchored at (-180, -90) — a global origin, not the corner of
    whatever the user happens to be looking at. Panning therefore slides the
    viewport across a fixed grid and pins stay put; only zooming changes the
    grouping, which is what makes zooming in feel like clusters splitting rather
    than everything rearranging itself.
    """
    if span_degrees <= 0:
        # a degenerate viewport (zero span) still has to answer something
        span_degrees = 1e-6
    target = span_degrees / max(1, cells_per_axis)
    k = math.floor(math.log2(360.0 / target))
    # floor at 3 (45-degree cells) because a coarser grid than that cannot bound
    # a whole-world view any better, and cap at 30 (~4 cm) because past that the
    # grid is finer than any coordinate is accurate and doubles for nothing
    k = max(3, min(30, k))
    return 360.0 / (2 ** k)


@customer_blueprint.route('/map-clusters', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value)
def customer_map_clusters():
    """Summarise the customers in a viewport as at most 100 map pins.

    The map used to render this from `GET /customer/?within_polygon=...`, which
    forces per_page to 10000 and serialises a full CustomerRead per row — the
    reason the app died on any account with real customer volume. Here the
    response size is fixed by the grid, so it does not grow with the number of
    customers: a viewport holding 50 customers and one holding 50,000 both come
    back as at most 100 rows.

    A pin with count == 1 carries its customer's uuid so the app can open the
    existing detail popup; the expensive full DTO is fetched for that one
    customer on tap, which is the only place it is actually needed.
    """
    params = CustomerMapClusterParams(**request.args)

    try:
        poly = WKTElement(params.within_polygon, srid=CustomerModel.coordinates.type.srid)
    except (ValidationError, ValueError) as e:
        raise BadRequestError(f"Invalid polygon: {e}")

    with SqlAlchemyUnitOfWork() as uow:
        # Ask PostGIS for the viewport's extent rather than parsing WKT here, so
        # the polygon is validated by the same code that will filter on it. An
        # unparseable polygon raises here instead of silently matching nothing.
        try:
            xmin, ymin, xmax, ymax = uow.session.execute(
                select(
                    func.ST_XMin(poly), func.ST_YMin(poly),
                    func.ST_XMax(poly), func.ST_YMax(poly),
                )
            ).one()
        except Exception as e:
            raise BadRequestError(f"Invalid polygon: {e}")

        cell = grid_cell_degrees(max(float(xmax) - float(xmin), float(ymax) - float(ymin)))

        filters = [
            CustomerModel.is_deleted == False,
            CustomerModel.coordinates.is_not(None),
            CustomerModel.coordinates.ST_Within(poly),  # type: ignore[attr-defined]
        ]
        # This is a raw session query, so it is OUTSIDE the repository layer that
        # normally injects the tenant filter (AbstractRepository._scope_filters).
        # Without this line the map would show every account's customers. None
        # means the platform owner, who is deliberately unscoped — same condition
        # the repositories use.
        if uow.account_uuid is not None:
            filters.append(CustomerModel.account_uuid == uow.account_uuid)

        if params.category:
            filters.append(CustomerModel.category == params.category.value)
        if params.company_name:
            filters.append(CustomerModel.company_name.ilike(f"%{params.company_name}%"))
        if params.full_name:
            filters.append(CustomerModel.full_name.ilike(f"%{params.full_name}%"))

        # Integer cell indices via floor, NOT ST_SnapToGrid. SnapToGrid rounds to
        # the nearest node, which puts cell boundaries at odd half-multiples of
        # the size — so consecutive levels of the ladder are not nested and
        # zooming in makes clusters merge and re-split incoherently instead of
        # each one dividing. floor nests exactly, because
        # floor(u) == floor(floor(2u) / 2) for every u.
        grid_x = func.floor((func.ST_X(CustomerModel.coordinates) + 180.0) / cell)
        grid_y = func.floor((func.ST_Y(CustomerModel.coordinates) + 90.0) / cell)
        # The pin sits on the centroid of its members, not on the cell's centre,
        # so a cluster appears over the customers it stands for instead of on an
        # arbitrary grid intersection.
        centroid = func.ST_Centroid(func.ST_Collect(CustomerModel.coordinates))

        rows = (
            uow.session.query(
                func.count().label("n"),
                func.ST_Y(centroid).label("lat"),
                func.ST_X(centroid).label("lng"),
                # only meaningful for a single-member cell, which is the only
                # case that reads them; min() over one row is that row
                func.min(CustomerModel.uuid).label("uuid"),
                func.min(CustomerModel.company_name).label("company_name"),
                func.min(func.ST_Y(CustomerModel.coordinates)).label("min_lat"),
                func.max(func.ST_Y(CustomerModel.coordinates)).label("max_lat"),
                func.min(func.ST_X(CustomerModel.coordinates)).label("min_lng"),
                func.max(func.ST_X(CustomerModel.coordinates)).label("max_lng"),
            )
            .filter(*filters)
            .group_by(grid_x, grid_y)
            .order_by(func.count().desc())
            .limit(MAX_MAP_POINTS)
            .all()
        )

        clusters = [
            CustomerMapCluster(
                latitude=float(r.lat),
                longitude=float(r.lng),
                count=int(r.n),
                customer_uuid=r.uuid if int(r.n) == 1 else None,
                company_name=r.company_name if int(r.n) == 1 else None,
                min_latitude=float(r.min_lat),
                max_latitude=float(r.max_lat),
                min_longitude=float(r.min_lng),
                max_longitude=float(r.max_lng),
            )
            for r in rows
            # a NULL centroid would mean an empty collection, which grouping
            # cannot produce — but a bad row must not become a pin at (0, 0)
            if r.lat is not None and r.lng is not None
        ]

        result = CustomerMapClusterPage(
            clusters=clusters,
            total_count=sum(c.count for c in clusters),
            cell_size_degrees=cell,
        ).model_dump(mode='json')

    return jsonify(result), 200
