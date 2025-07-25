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
from app.entrypoint.routes.auth import auth_blueprint
from app.entrypoint.routes.workflow import workflow_blueprint
from app.entrypoint.routes.task import task_blueprint
from app.entrypoint.routes.workflow_execution import workflow_execution_blueprint
from app.entrypoint.routes.task_execution import task_execution_blueprint
from app.entrypoint.routes.quality_control import quality_control_blueprint
from app.entrypoint.routes.vehicle import vehicle_blueprint
from app.entrypoint.routes.service_area import service_area_blueprint
from app.entrypoint.routes.trip import trip_blueprint
from app.entrypoint.routes.trip_stop import trip_stop_blueprint


jwt = JWTManager()
load_dotenv()
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

    app.config['JWT_SECRET_KEY'] = "super-secret-change-me"
    # accept tokens from both headers and cookies
    app.config['JWT_TOKEN_LOCATION'] = ["headers", "cookies"]
    app.config['JWT_COOKIE_SECURE']   = False     # only over HTTPS in prod
    app.config['JWT_COOKIE_SAMESITE'] = 'Lax'
    app.config['JWT_ACCESS_COOKIE_PATH'] = '/'
    app.config["JWT_COOKIE_CSRF_PROTECT"] = False # TESTING
    jwt.init_app(app)

    # Register blueprints
    app.register_blueprint(customer_blueprint, url_prefix='/customer')
    app.register_blueprint(material_blueprint, url_prefix='/material')
    app.register_blueprint(vendor_blueprint, url_prefix='/vendor')
    app.register_blueprint(employee_blueprint, url_prefix='/employee')
    app.register_blueprint(expense_blueprint, url_prefix='/expense')
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
    app.register_blueprint(auth_blueprint, url_prefix='/auth')
    app.register_blueprint(workflow_blueprint, url_prefix='/workflow')
    app.register_blueprint(task_blueprint, url_prefix='/task')
    app.register_blueprint(workflow_execution_blueprint, url_prefix='/workflow-execution')
    app.register_blueprint(task_execution_blueprint, url_prefix='/task-execution')
    app.register_blueprint(quality_control_blueprint, url_prefix='/quality-control')
    app.register_blueprint(vehicle_blueprint, url_prefix='/vehicle')
    app.register_blueprint(service_area_blueprint, url_prefix='/service-area')
    app.register_blueprint(trip_blueprint, url_prefix='/trip')
    app.register_blueprint(trip_stop_blueprint, url_prefix='/trip-stop')

    register_error_handlers(app)
    return app