from sqlalchemy.exc import IntegrityError
# app/core/errors.py

class ApiError(Exception):
    """Base class for all our application errors."""
    status_code = 400
    def __init__(self, message: str, status_code: int = None, payload: dict = None):
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code
        self.message = message
        self.payload = payload or {}

class NotFoundError(ApiError):
    """Resource not found."""
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404)

class BadRequestError(ApiError):
    """A 400-level error, e.g. validation."""
    def __init__(self, message: str = "Bad request"):
        super().__init__(message, status_code=400)



# still in app/core/errors.py

from flask import jsonify
from pydantic import ValidationError as PydanticValidationError

def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        payload = {"error": error.message, **error.payload}
        return jsonify(payload), error.status_code

    @app.errorhandler(PydanticValidationError)
    def handle_validation_error(exc: PydanticValidationError):
        # e.errors() is a list of field errors; ctx may contain raw exception
        # objects (e.g. ValueError from model_validators) that jsonify chokes
        # on — strip the non-serializable context
        details = [
            {k: v for k, v in err.items() if k != "ctx"} for err in exc.errors()
        ]
        return jsonify({"error": "Validation error", "details": details}), 422

    @app.errorhandler(IntegrityError)
    def integrity_error(e):
        # A DB constraint is the last line of defence — the domains validate
        # first and return a 400 with a useful message. Reaching here means a
        # race or a path that skipped validation, and it should not read as a
        # server fault.
        message = "Conflicts with an existing record"
        detail = str(getattr(e, 'orig', e))
        if 'uq_financial_account_internal_currency' in detail:
            message = (
                "This currency already has a non-external financial account. "
                "Only one is allowed per currency."
            )
        return jsonify({"error": message}), 409

    @app.errorhandler(404)
    def not_found(e):
        # convert anything else 404 into our JSON form
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500
