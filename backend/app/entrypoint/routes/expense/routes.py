from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.expense import (
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    ExpenseReadList,
    ExpenseListParams,
    ExpensePage
)
from models.common import Expense as ExpenseModel
from app.entrypoint.routes.expense import expense_blueprint

from app.domains.expense.domain import ExpenseDomain
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.expense import ExpenseCategory

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required


@expense_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value)
def create_expense():
    current_uuid = get_jwt_identity()
    payload = ExpenseCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_uuid, payload=payload)
        expense_read = ExpenseDomain.create_expense(uow=uow, payload=payload)
        result = expense_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201


@expense_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value)
def get_expense(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid, is_deleted=False)
        if not exp:
            raise NotFoundError(f"Expense with uuid {uuid} not found")
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')
    return jsonify(expense_data), 200

@expense_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value)
def update_expense(uuid: str):
    payload = ExpenseUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid,is_deleted=False)
        if not exp:
            raise NotFoundError(f"Expense with uuid {uuid} not found")

        for field, val in data.items():
            setattr(exp, field, val)
        uow.expense_repository.save(model=exp, commit=True)
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')

    return jsonify(expense_data), 200


@expense_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_expense(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = ExpenseDomain.delete_expense(uuid=uuid, uow=uow)
        result = dto.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200


@expense_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value)
def list_expenses():
    # Parse & validate query & pagination params
    params = ExpenseListParams(**request.args)

    # Build filters list based on DTO
    filters = [ExpenseModel.is_deleted == False]
    if params.uuid:
        filters.append(ExpenseModel.uuid == str(params.uuid))
    if params.vendor_uuid:
        filters.append(ExpenseModel.vendor_uuid == str(params.vendor_uuid))
    if params.trip_uuid:
        filters.append(ExpenseModel.trip_uuid == str(params.trip_uuid))
    if params.category:
        filters.append(ExpenseModel.category == params.category.value)
    if params.start:
        filters.append(ExpenseModel.created_at >= params.start)
    if params.end:
        filters.append(ExpenseModel.created_at <= params.end)
    if params.status:
        filters.append(ExpenseModel.status == params.status.value)
    if params.is_paid is not None:
        filters.append(ExpenseModel.is_paid == params.is_paid)

    # Fetch paginated results
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.expense_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )

        items = [
            ExpenseRead.from_orm(e).model_dump(mode='json')
            for e in page_obj.items
        ]

        # Build paginated response via DTO
        result = ExpensePage(
            expenses=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200


@expense_blueprint.route('/categories', methods=['GET'])
def list_expense_categories():
    categories = [category.value for category in ExpenseCategory]
    return jsonify(categories), 200

# ----------------------------- EXPENSE ANALYTICS -----------------------------
# Read-only aggregates for the Expenses > Analytics tab. Raw session queries
# here bypass repository scoping, so each one filters account_uuid itself.
#
# Amounts are NEVER summed across currencies: the caller picks one currency and
# every series is in it. `currencies` reports the totals per currency so the UI
# can offer the picker and default to the busiest one.

@expense_blueprint.route('/analytics/over-time', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value)
def expense_analytics_over_time():
    from sqlalchemy import func
    from app.entrypoint.routes.common.analytics import (
        bucket_arg,
        csv_arg,
        parse_dt,
    )

    bucket = bucket_arg("month")
    start = parse_dt(request.args.get("start_date"))
    end = parse_dt(request.args.get("end_date"), end_of_day=True)
    categories = csv_arg("categories")
    vendor_uuid = request.args.get("vendor_uuid")
    currency = request.args.get("currency")

    with SqlAlchemyUnitOfWork() as uow:
        base = [
            ExpenseModel.account_uuid == uow.account_uuid,
            ExpenseModel.is_deleted == False,
        ]
        if start:
            base.append(ExpenseModel.created_at >= start)
        if end:
            base.append(ExpenseModel.created_at <= end)
        if categories:
            base.append(ExpenseModel.category.in_(categories))
        if vendor_uuid:
            base.append(ExpenseModel.vendor_uuid == vendor_uuid)

        # totals per currency drive the picker; also the honest answer to
        # "how much did we spend" when several currencies are in play
        per_currency = {
            cur: round(float(total or 0), 2)
            for cur, total in (
                uow.session.query(
                    ExpenseModel.currency, func.sum(ExpenseModel.amount)
                )
                .filter(*base)
                .group_by(ExpenseModel.currency)
                .all()
            )
        }
        if not per_currency:
            # every key the populated response has, or the client reads
            # undefined off the "no expenses yet" case and blows up
            return jsonify({
                "bucket": bucket,
                "currency": currency,
                "currencies": {},
                "categories": [],
                "category_totals": {},
                "buckets": [],
                "total": 0.0,
                "paid": 0.0,
                "unpaid": 0.0,
                "count": 0,
            }), 200

        # default to the currency carrying the most spend, so the first paint
        # shows the meaningful chart rather than an arbitrary one
        if currency not in per_currency:
            currency = max(per_currency, key=lambda c: per_currency[c])
        scoped = base + [ExpenseModel.currency == currency]

        period = func.date_trunc(bucket, ExpenseModel.created_at)
        rows = (
            uow.session.query(
                period.label("period"),
                ExpenseModel.category,
                func.sum(ExpenseModel.amount),
            )
            .filter(*scoped)
            .group_by(period, ExpenseModel.category)
            .order_by(period)
            .all()
        )

        by_period: dict = {}
        cat_totals: dict = {}
        for p, cat, amount in rows:
            amount = round(float(amount or 0), 2)
            key = p.isoformat()
            entry = by_period.setdefault(key, {})
            entry[cat] = round(entry.get(cat, 0.0) + amount, 2)
            cat_totals[cat] = round(cat_totals.get(cat, 0.0) + amount, 2)

        # biggest spend first, so the stack order and the legend agree and the
        # colours stay stable as the window changes
        ordered_categories = sorted(cat_totals, key=lambda c: cat_totals[c], reverse=True)

        buckets = [
            {
                "period": key,
                "amounts": amounts,
                "total": round(sum(amounts.values()), 2),
            }
            for key, amounts in sorted(by_period.items())
        ]

        paid, count = (
            uow.session.query(
                func.coalesce(func.sum(ExpenseModel.amount_paid), 0),
                func.count(ExpenseModel.uuid),
            )
            .filter(*scoped)
            .first()
        )

        total = round(sum(b["total"] for b in buckets), 2)
        result = {
            "bucket": bucket,
            "currency": currency,
            "currencies": per_currency,
            "categories": ordered_categories,
            "category_totals": cat_totals,
            "buckets": buckets,
            "total": total,
            "paid": round(float(paid or 0), 2),
            "unpaid": round(total - float(paid or 0), 2),
            "count": int(count or 0),
        }
    return jsonify(result), 200
