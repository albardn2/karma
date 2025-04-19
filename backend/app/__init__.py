# app/__init__.py
import os

from dotenv import load_dotenv, dotenv_values
from flask import Flask
from app.config import Config

from app.entrypoint.routes.common.errors import register_error_handlers
from app.entrypoint.routes.customer import customer_blueprint

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
    # app.register_blueprint(financials_blueprint, url_prefix='/financials')

    # Register error handlers
    register_error_handlers(app)

    return app