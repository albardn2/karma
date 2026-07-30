# app/__init__.py
import os
from dotenv import load_dotenv, dotenv_values
from flask import Flask
from app.config import Config
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from app.entrypoint.routes.common.errors import register_error_handlers
from app.entrypoint.routes.customer import customer_blueprint
from app.entrypoint.routes.material import material_blueprint
from app.entrypoint.routes.vendor import vendor_blueprint
from app.entrypoint.routes.employee import employee_blueprint
from app.entrypoint.routes.expense import expense_blueprint
from app.entrypoint.routes.exchange_rate import exchange_rate_blueprint
from app.entrypoint.routes.pricing import pricing_blueprint
from app.entrypoint.routes.purchase_order import purchase_order_blueprint
from app.entrypoint.routes.purchase_order_item import poi_blueprint
from app.entrypoint.routes.financial_account import financial_account_blueprint
from app.entrypoint.routes.warehouse import warehouse_blueprint
from app.entrypoint.routes.fixed_asset import fixed_asset_blueprint
from app.entrypoint.routes.transaction import transaction_blueprint
from app.entrypoint.routes.customer_order import customer_order_blueprint
from app.entrypoint.routes.customer_order_item import customer_order_item_blueprint
from app.entrypoint.routes.invoice import invoice_blueprint
from app.entrypoint.routes.invoice_item import invoice_item_blueprint
from app.entrypoint.routes.payment import payment_blueprint
from app.entrypoint.routes.payout import payout_blueprint
from app.entrypoint.routes.inventory import inventory_blueprint
from app.entrypoint.routes.inventory_event import inventory_event_blueprint
from app.entrypoint.routes.debit_note import debit_note_item_blueprint
from app.entrypoint.routes.credit_note import credit_note_item_blueprint
from app.entrypoint.routes.process import process_blueprint
from app.entrypoint.routes.process_template import process_template_blueprint
from app.entrypoint.routes.dashboard import dashboard_blueprint
from app.entrypoint.routes.super_admin import super_admin_blueprint
from app.entrypoint.routes.auth import auth_blueprint
from app.entrypoint.routes.workflow import workflow_blueprint
from app.entrypoint.routes.task import task_blueprint
from app.entrypoint.routes.workflow_execution import workflow_execution_blueprint
from app.entrypoint.routes.task_execution import task_execution_blueprint
from app.entrypoint.routes.quality_control import quality_control_blueprint
from app.entrypoint.routes.vehicle import vehicle_blueprint
from app.entrypoint.routes.service_area import service_area_blueprint
from app.entrypoint.routes.location import location_blueprint
from app.entrypoint.routes.trip import trip_blueprint
from app.entrypoint.routes.trip_stop import trip_stop_blueprint
from app.entrypoint.routes.vehicle_inventory import vehicle_inventory_blueprint
from app.entrypoint.routes.vehicle_inventory_event import vehicle_inventory_event_blueprint


jwt = JWTManager()
load_dotenv()


def _load_request_identity():
    # Request chokepoint: resolve the caller's user row once and put the
    # tenant scope + fine-grained ACL on flask.g.
    #  - g.account_uuid: the UnitOfWork picks it up and every repository
    #    read/write is filtered/stamped with it.
    #  - g.user_acl / g.is_admin: the caller's EFFECTIVE fine-grained
    #    permissions — their explicit checklist, or their role's preset
    #    (roles are shortcuts for a pre-defined permission set). This is
    #    the source of truth: a non-admin must be granted the matching
    #    CRUD action on the resource blueprint or the request is rejected
    #    right here. Admins bypass (g.user_acl None).
    # Absent or unreadable tokens leave g unset and continue: protected routes
    # still reject them via their own decorators, and unauthenticated routes
    # (login/signup) must run unscoped since no tenant is known yet. A token
    # that IS readable but whose user cannot be resolved is a different
    # story — see the 401 below.
    #
    # Module-level rather than nested in create_app so the security decisions
    # here can be unit-tested directly (tests/entrypoint/test_request_identity).
    from flask import g, jsonify, request
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    from app.entrypoint.routes.common.permissions import (
        RESOURCE_SET,
        endpoint_allowed,
        effective_permissions,
    )
    try:
        verify_jwt_in_request(optional=True)
        claims = get_jwt()
    except Exception:
        return None
    if not claims:
        return None

    from app.adapters.unit_of_work.sqlalchemy_unit_of_work import (
        SqlAlchemyUnitOfWork,
    )
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        user = uow.user_repository.find_one(
            uuid=claims.get("sub"), is_deleted=False
        )
        if not user:
            # The token is validly signed but names a user who no longer
            # exists (offboarded via DELETE /auth/user/<uuid>, which only
            # soft-deletes and cannot revoke a live token).
            #
            # This MUST fail closed. Continuing left g unset, and everything
            # downstream reads that as "unscoped": the UnitOfWork built every
            # repository with account_uuid=None so no tenant filter was
            # applied to any query, scopes_required fell back to the token's
            # stale `scopes` claim instead of the DB-fresh set, and the
            # per-endpoint ACL gate below was skipped entirely. A deleted
            # driver replaying their token read every tenant's data for the
            # remaining life of it (24h) — verified against a local stack:
            # GET /customer/ went from 267 rows (their own account) to 269
            # (all accounts) the moment their user row was soft-deleted.
            #
            # 401 rather than 403 so both clients' auto-logout machinery runs,
            # matching the blocked-account branch below.
            return jsonify({"msg": "User no longer exists"}), 401
        # Deactivation revokes LIVE sessions, not just future logins: this
        # runs before every request and reads the row fresh, so flipping
        # is_active off takes effect on the deactivated user's very next
        # request rather than whenever their 24h token happens to expire.
        # 401 so both clients' auto-logout machinery signs them out.
        if not user.is_active:
            return jsonify({"msg": "This user has been deactivated"}), 401
        # blocked account / tenant feature cap: resolved fresh per
        # request (the platform owner is exempt from both)
        g.account_perms = None
        # True is the PLATFORM OWNER's value: superusers skip the block below and
        # are exempt from verification exactly as they are from is_blocked and the
        # feature cap. A tenant user always has this overwritten from their row.
        g.account_verified = True
        if not user.is_superuser:
            from models.common import Account as AccountModel
            acct = (
                uow.session.query(
                    AccountModel.is_blocked,
                    AccountModel.permissions,
                    # LAST on purpose — acct[2] below indexes into this tuple,
                    # and tests mock this query's return value positionally.
                    AccountModel.is_verified,
                )
                .filter(AccountModel.uuid == user.account_uuid)
                .first()
            )
            if acct and acct[0]:
                # 401 (not 403) so both clients' auto-logout machinery
                # kicks in: web clears the token and reloads to the login
                # page; the app fails its refresh and signs out — active
                # sessions are revoked on their next request
                return jsonify({"msg": "This account is blocked"}), 401
            g.account_perms = acct[1] if acct else None
            # No row means the account cannot be resolved, which must deny
            # rather than admit — the same fail-closed reasoning as the deleted-user
            # branch above.
            g.account_verified = bool(acct[2]) if acct else False
        # impersonation: a superuser token may carry a target account —
        # the platform owner operates inside that tenant's scope
        imp_account = claims.get("imp_account_uuid")
        if imp_account and user.is_superuser:
            g.account_uuid = imp_account
        else:
            g.account_uuid = user.account_uuid
        g.is_admin = user.is_admin
        # DB-fresh scopes: role changes apply to live sessions immediately
        # (the JWT scopes claim is only a fallback, it goes stale)
        g.user_scopes = set((user.permission_scope or "").split(","))
        # effective perms: explicit checklist or role preset (None = admin)
        g.user_acl = effective_permissions(user)

    if request.blueprint in RESOURCE_SET:
        # An unverified company gets no resource access at all. FIRST in this
        # block on purpose: it is the coarsest gate, it binds admins as well as
        # staff, and answering "not verified" before "missing permission" is both
        # cheaper and the truer explanation of why the request failed.
        #
        # `auth` is not in RESOURCE_SET, so /auth/login, /auth/refresh and
        # /auth/me keep working — which is exactly what lets a signed-in user be
        # told they are unverified rather than simply failing.
        # Plain attribute access, not a defaulted getattr: this block is only
        # reached for an authenticated request (the `if not claims: return None`
        # above), and every such path sets g.account_verified. A missing attribute
        # would mean that invariant broke, and on a security gate that must fail
        # loudly rather than quietly open.
        if not g.account_verified:
            # 403, deliberately NOT the 401 that a blocked account returns. The
            # requirement is that an unverified company CAN sign in and be told
            # why nothing works; a 401 trips both clients' auto-logout and bounces
            # them to the login screen, which is the one behaviour this must avoid.
            # The `code` is what the clients branch on — message text is not a
            # contract, and both of them need to distinguish this from an ordinary
            # permission denial.
            return jsonify(
                {"msg": "This account is pending verification",
                 "code": "account_unverified"}
            ), 403
        # tenant feature cap binds EVERYONE in the account, admins
        # included (the platform owner is exempt — g.account_perms None)
        if g.account_perms is not None and not endpoint_allowed(
            g.account_perms, request.blueprint, request.method
        ):
            return jsonify(
                {"msg": "Forbidden — feature not enabled for this account"}
            ), 403
        # per-user fine-grained grant (admins bypass)
        if (
            not g.is_admin
            and g.user_acl is not None
            and not endpoint_allowed(g.user_acl, request.blueprint, request.method)
        ):
            return jsonify({"msg": "Forbidden — missing endpoint permission"}), 403
    return None


def create_app(config_object=Config):
    app = Flask(__name__)

    # CORS(app, supports_credentials=True)
    # CORS FOR ANY ORIGIN
    CORS(app)

    # load configs from .env
    app.config.from_object(Config)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    env_config = dotenv_values(os.path.join(BASE_DIR,"..", ".env"))
    app.config.from_mapping(env_config)

    # the JWT signing secret must come from the environment (or the .env file
    # loaded above) — never from source. Refuse to boot without it so a
    # misconfigured deploy fails loudly instead of signing forgeable tokens.
    jwt_secret = os.environ.get("JWT_SECRET_KEY") or app.config.get("JWT_SECRET_KEY")
    if not jwt_secret:
        raise RuntimeError("JWT_SECRET_KEY environment variable must be set")
    app.config['JWT_SECRET_KEY'] = jwt_secret
    # accept tokens from both headers and cookies
    app.config['JWT_TOKEN_LOCATION'] = ["headers", "cookies"]
    app.config['JWT_COOKIE_SECURE']   = False     # only over HTTPS in prod
    app.config['JWT_COOKIE_SAMESITE'] = 'Lax'
    app.config['JWT_ACCESS_COOKIE_PATH'] = '/'
    app.config["JWT_COOKIE_CSRF_PROTECT"] = False # TESTING
    jwt.init_app(app)

    app.before_request(_load_request_identity)

    # Register blueprints
    app.register_blueprint(customer_blueprint, url_prefix='/customer')
    app.register_blueprint(material_blueprint, url_prefix='/material')
    app.register_blueprint(vendor_blueprint, url_prefix='/vendor')
    app.register_blueprint(employee_blueprint, url_prefix='/employee')
    app.register_blueprint(expense_blueprint, url_prefix='/expense')
    app.register_blueprint(exchange_rate_blueprint, url_prefix='/exchange-rate')
    app.register_blueprint(pricing_blueprint, url_prefix='/pricing')
    app.register_blueprint(purchase_order_blueprint, url_prefix='/purchase-order')
    app.register_blueprint(poi_blueprint, url_prefix='/purchase-order-item')
    app.register_blueprint(financial_account_blueprint, url_prefix='/financial-account')
    app.register_blueprint(warehouse_blueprint, url_prefix='/warehouse')
    app.register_blueprint(fixed_asset_blueprint, url_prefix='/fixed-asset')
    app.register_blueprint(transaction_blueprint, url_prefix='/transaction')
    app.register_blueprint(customer_order_blueprint, url_prefix='/customer-order')
    app.register_blueprint(customer_order_item_blueprint, url_prefix='/customer-order-item')
    app.register_blueprint(invoice_blueprint, url_prefix='/invoice')
    app.register_blueprint(invoice_item_blueprint, url_prefix='/invoice-item')
    app.register_blueprint(payment_blueprint, url_prefix='/payment')
    app.register_blueprint(payout_blueprint, url_prefix='/payout')
    app.register_blueprint(inventory_blueprint, url_prefix='/inventory')
    app.register_blueprint(inventory_event_blueprint, url_prefix='/inventory-event')
    app.register_blueprint(debit_note_item_blueprint, url_prefix='/debit-note-item')
    app.register_blueprint(credit_note_item_blueprint, url_prefix='/credit-note-item')
    app.register_blueprint(process_blueprint, url_prefix='/process')
    app.register_blueprint(process_template_blueprint, url_prefix='/process-template')
    app.register_blueprint(dashboard_blueprint, url_prefix='/dashboard')
    app.register_blueprint(super_admin_blueprint, url_prefix='/super-admin')
    app.register_blueprint(auth_blueprint, url_prefix='/auth')
    app.register_blueprint(workflow_blueprint, url_prefix='/workflow')
    app.register_blueprint(task_blueprint, url_prefix='/task')
    app.register_blueprint(workflow_execution_blueprint, url_prefix='/workflow-execution')
    app.register_blueprint(task_execution_blueprint, url_prefix='/task-execution')
    app.register_blueprint(quality_control_blueprint, url_prefix='/quality-control')
    app.register_blueprint(vehicle_blueprint, url_prefix='/vehicle')
    app.register_blueprint(service_area_blueprint, url_prefix='/service-area')
    app.register_blueprint(location_blueprint, url_prefix='/location')
    app.register_blueprint(trip_blueprint, url_prefix='/trip')
    app.register_blueprint(trip_stop_blueprint, url_prefix='/trip-stop')
    app.register_blueprint(vehicle_inventory_blueprint, url_prefix='/vehicle-inventory')
    app.register_blueprint(vehicle_inventory_event_blueprint, url_prefix='/vehicle-inventory-event')

    register_error_handlers(app)
    return app