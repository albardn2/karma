from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice_item import (
    InvoiceItemBulkCreate,
    InvoiceItemBulkRead,
    InvoiceItemCreate,
    InvoiceItemRead,
    InvoiceItemListParams,
    InvoiceItemPage,
    InvoiceItemBulkDelete,
)
from models.common import InvoiceItem as InvoiceItemModel
from app.domains.invoice_item.domain import InvoiceItemDomain

from app.entrypoint.routes.invoice_item import invoice_item_blueprint
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@invoice_item_blueprint.route('/bulk-create', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def bulk_create_invoice_items():
    current_user_uuid = get_jwt_identity()
    payload = InvoiceItemBulkCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        for item in payload.items:
            add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=item)
        bulk_read: InvoiceItemBulkRead = InvoiceItemDomain.create_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 201

@invoice_item_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def get_invoice_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        item = uow.invoice_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not item:
            raise NotFoundError('InvoiceItem not found')
        result = InvoiceItemRead.from_orm(item).model_dump(mode='json')
    return jsonify(result), 200
#
@invoice_item_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def list_invoice_items():
    params = InvoiceItemListParams(**request.args)
    filters = [InvoiceItemModel.is_deleted == False]
    if params.invoice_uuid:
        filters.append(InvoiceItemModel.invoice_uuid == params.invoice_uuid)
    if params.customer_order_item_uuid:
        filters.append(InvoiceItemModel.customer_order_item_uuid == params.customer_order_item_uuid)
    if params.uuid:
        filters.append(InvoiceItemModel.uuid == params.uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.invoice_item_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [InvoiceItemRead.from_orm(i).model_dump(mode='json') for i in page_obj.items]
        result = InvoiceItemPage(
            items=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
#
@invoice_item_blueprint.route('/bulk-delete', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def bulk_delete_invoice_items():
    payload = InvoiceItemBulkDelete(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read: InvoiceItemBulkRead = InvoiceItemDomain.delete_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 200


# ---------------------------------------------------------------------------
# Payment-aware price editing
# ---------------------------------------------------------------------------

def order_price_edit_state(order):
    """Whether line prices on this ORDER may be edited, and how.

    Returns (state, payment):
      * "unpaid"         — nothing has settled any of the order's invoices:
                           prices may change freely, nothing else moves.
      * "single_payment" — the order is fully paid by exactly ONE payment:
                           a price change is allowed and that payment moves by
                           the same delta, so the order stays exactly paid.
                           `payment` is that payment.
      * "locked"         — every other case (partially paid, several payments,
                           credit/debit notes in play): the money trail is not
                           a single reversible step, so prices are read-only.

    Credit/debit notes lock even the unpaid case on purpose: they adjust the
    very total a price edit would change, and untangling which of the two
    "corrections" wins is a judgement call, not arithmetic.
    """
    from models.common import MONEY_TOLERANCE

    invoices = [inv for inv in order.invoices if not inv.is_deleted]
    payments = [
        p for inv in invoices for p in inv.payments if not p.is_deleted
    ]
    has_notes = any(
        not note.is_deleted
        for inv in invoices
        for item in inv.invoice_items
        if not item.is_deleted
        for note in (list(item.credit_note_items) + list(item.debit_note_items))
    )
    if has_notes:
        return "locked", None
    if not payments and abs(order.net_amount_paid) <= MONEY_TOLERANCE:
        return "unpaid", None
    if len(payments) == 1 and order.is_paid:
        return "single_payment", payments[0]
    return "locked", None


@invoice_item_blueprint.route('/<string:uuid>/price', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def update_invoice_item_price(uuid: str):
    """Change one line's price per unit, if the order's payment state allows.

    unpaid          -> the price changes, nothing else moves.
    single_payment  -> the price changes AND the one payment that settled the
                       order moves by the same delta, so the order stays
                       exactly paid — a correction, not a new money event.
    locked          -> 409 with code "price_locked"; nothing changes.
    """
    from flask import g
    from models.common import MONEY_TOLERANCE
    from app.dto.invoice_item import InvoiceItemPriceUpdate
    from app.dto.payment import PaymentRead
    from app.entrypoint.routes.common.errors import BadRequestError

    payload = InvoiceItemPriceUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        item = uow.invoice_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not item:
            raise NotFoundError('Invoice item not found')
        invoice = item.invoice
        if not invoice or invoice.is_deleted:
            raise NotFoundError('Invoice not found')
        order = invoice.customer_order

        state, payment = order_price_edit_state(order)
        if state == "locked":
            return jsonify({
                "code": "price_locked",
                "msg": "Price editing is locked: the order is partially paid, "
                       "settled by several payments, or carries credit/debit "
                       "notes.",
            }), 409

        old_price = item.price_per_unit or 0.0
        delta = (payload.price_per_unit - old_price) * (item.quantity or 0)

        adjusted_payment = None
        if state == "single_payment":
            # the payment must sit on the same invoice as the line it is asked
            # to absorb — with several invoices on the order, moving invoice
            # B's total against invoice A's payment would unbalance both
            if payment.invoice_uuid != invoice.uuid:
                return jsonify({
                    "code": "price_locked",
                    "msg": "The order's payment settles a different invoice "
                           "than this line's.",
                }), 409
            new_amount = (payment.amount or 0.0) + delta
            if new_amount < -MONEY_TOLERANCE:
                raise BadRequestError(
                    f"price change would drive the payment negative "
                    f"({round(new_amount, 2)})"
                )
            payment.amount = max(0.0, new_amount)
            adjusted_payment = payment

        item.price_per_unit = payload.price_per_unit
        uow.session.flush()

        # the whole point of the single-payment branch is that the order stays
        # exactly paid; if float dust or a missed relationship broke that,
        # refuse to commit rather than ship a half-applied correction
        if state == "single_payment" and abs(order.net_amount_due) > MONEY_TOLERANCE:
            uow.session.rollback()
            raise BadRequestError(
                "price change failed to keep the order fully paid; nothing "
                "was changed"
            )

        result = {
            "invoice_item": InvoiceItemRead.from_orm(item).model_dump(mode='json'),
            "payment": (
                PaymentRead.from_orm(adjusted_payment).model_dump(mode='json')
                if adjusted_payment else None
            ),
            "price_edit_state": state,
        }
        uow.commit()
    return jsonify(result), 200
