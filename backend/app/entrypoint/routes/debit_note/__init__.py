# app/domains/hello/__init__.py
from flask import Blueprint

debit_note_item_blueprint = Blueprint('debit_note_item', __name__)

# Import routes so they are registered with the blueprint
from . import routes
