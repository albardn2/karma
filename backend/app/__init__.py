# app/__init__.py
from flask import Flask

from app.common.errors import register_error_handlers
from app.config import Config
from app.domains.analytics import analytics_blueprint
from app.domains.financials import financials_blueprint


def create_app(config_object=Config):


    app = Flask(__name__)
    app.config.from_object(config_object)

    # Register blueprints
    app.register_blueprint(analytics_blueprint, url_prefix='/analytics')
    app.register_blueprint(financials_blueprint, url_prefix='/financials')

    # Register error handlers
    register_error_handlers(app)

    return app