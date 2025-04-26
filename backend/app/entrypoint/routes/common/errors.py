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
        # e.errors() is a list of field errors
        return jsonify({"error": "Validation error", "details": exc.errors()}), 422

    @app.errorhandler(404)
    def not_found(e):
        # convert anything else 404 into our JSON form
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500
