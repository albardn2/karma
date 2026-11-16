from typing import Optional

from flask import request

from app.dto.common_enums import Currency
from app.entrypoint.routes.common.errors import BadRequestError


def cost_currency_arg() -> Optional[Currency]:
    """The validated ?cost_currency= query arg, or None for the default."""
    raw = request.args.get('cost_currency')
    if not raw:
        return None
    try:
        return Currency(raw)
    except ValueError:
        raise BadRequestError(
            f"cost_currency must be one of {[c.value for c in Currency]}"
        )
