# app/__init__.py
import os

from dotenv import load_dotenv, dotenv_values
from flask import Flask
from app.config import Config

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

# from app.entrypoint.routes.fixed_asset import fixed_asset_blueprint

load_dotenv()

def create_app(config_object=Config):
    app = Flask(__name__)

    # load configs from .env
    app.config.from_object(Config)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    env_config = dotenv_values(os.path.join(BASE_DIR,"..", ".env"))
    app.config.from_mapping(env_config)

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
    # Register error handlers
    register_error_handlers(app)

    return app