from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, PlainSerializer

from app.utils.time_utils import to_naive_utc, utc_iso

# A timestamp as the API exchanges it: inbound values are normalised to the naive
# UTC the columns hold, so an aware client value compares correctly; outbound JSON
# carries a Z, so every client reads it as UTC rather than as its own local time.
UtcDateTime = Annotated[
    datetime,
    AfterValidator(to_naive_utc),
    PlainSerializer(utc_iso, return_type=str, when_used="json"),
]

# A calendar day the user picked (a due date, an expiry) held in a timestamp column.
# Sent without a zone, as stored, so every client reads the day as written: a Z would
# put it at UTC midnight, which is the previous day anywhere west of UTC.
CalendarDay = datetime
