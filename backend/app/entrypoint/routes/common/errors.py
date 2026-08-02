import re

from sqlalchemy.exc import IntegrityError

try:  # psycopg2 is the driver in every environment, but do not hard-fail without it
    from psycopg2.errors import NotNullViolation
except ImportError:  # pragma: no cover
    class NotNullViolation(Exception):  # type: ignore[no-redef]
        """Placeholder so isinstance() stays valid when psycopg2 is absent."""


def _not_null_column(detail: str) -> str | None:
    """Pull the column name out of Postgres' not-null message, if it is there."""
    match = re.search(r'null value in column "([^"]+)"', detail)
    return match.group(1) if match else None


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
        orig = getattr(e, 'orig', None)
        detail = str(orig if orig is not None else e)

        # Not every IntegrityError is a conflict. A NOT NULL violation means a
        # column the DTO left optional is mandatory in the schema — nobody
        # conflicted with anything, and answering 409 "Conflicts with an existing
        # record" sends the caller looking for a duplicate that does not exist.
        # This cost real debugging time on purchase_order_item.currency; keep the
        # two apart so the next one is obvious from the response alone.
        if isinstance(orig, NotNullViolation) or 'violates not-null constraint' in detail:
            column = _not_null_column(detail)
            return jsonify({
                "error": (f"'{column}' is required" if column
                          else "A required field was missing"),
                "detail": "not_null_violation",
            }), 422

        message = "Conflicts with an existing record"
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
