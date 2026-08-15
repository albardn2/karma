from enum import Enum

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency

from app.utils.geom_utils import lat_lon_to_wkt
from app.utils.geom_utils import wkt_or_wkb_to_lat_lon


class CustomerCategory(str, Enum):
    """Enum for customer categories."""
    ROASTERY = "roastery"
    RESTAURANT = "restaurant"
    MINIMARKET = "minimarket"
    SUPERMARKET = "supermarket"
    DISTRIBUTER = "distributer"
    SCHOOL = "school"
    UNIVERSITY = "university"
    HOSPITAL = "hospital"



MAX_TAG_LENGTH = 64
MAX_TAGS = 25


# The standard distribution-analytics tags, offered as a picker in both
# clients alongside free-form custom tags. Same bilingual-composite pattern as
# TripStopOutcome: each label is "<tag> - <arabic>", the clients' enumLabel
# splits on " - " (English before, Arabic after), and the CLEAN `tag` half is
# what gets stored — so analytics filter/group on machine strings while the
# UI translates. Single source of truth, served by /customer/tag-catalog;
# neither client hardcodes this list. Keys with values are single-valued per
# customer (normalize_tags enforces it), so picking a second value of the
# same key replaces the first. Values are data: renaming one orphans every
# customer already tagged with it.
PREDEFINED_CUSTOMER_TAGS: list[dict] = [
    {"tag": "customer_sale:no_sale", "label": "customer_sale:no_sale - بيع العميل: لا يوجد بيع"},
    {"tag": "customer_sale:one_time_sale", "label": "customer_sale:one_time_sale - بيع العميل: بيع لمرة واحدة"},
    {"tag": "customer_sale:repeated_sale", "label": "customer_sale:repeated_sale - بيع العميل: بيع متكرر"},
    {"tag": "customer_interest:not_interested", "label": "customer_interest:not_interested - اهتمام العميل: غير مهتم"},
    {"tag": "customer_interest:interested", "label": "customer_interest:interested - اهتمام العميل: مهتم"},
    {"tag": "blacklist", "label": "blacklist - القائمة السوداء"},
    {"tag": "agent", "label": "agent - وكيل"},
    {"tag": "skip_distribution", "label": "skip_distribution - تخطي التوزيع"},
    {"tag": "prioritize_next_stop", "label": "prioritize_next_stop - إعطاء الأولوية للمحطة القادمة"},
]


def _label_aliases() -> dict[str, str]:
    """Visible-text spellings of each predefined tag → its clean machine tag.

    AR-mode users see only the Arabic half of a catalog label on chips and
    badges, and nothing stops them retyping that text into the free-text tag
    input (or the list filter). Without a backstop those spellings are valid
    tags in their own right — 'بيع العميل: لا يوجد بيع' normalizes to an
    Arabic-KEYED tag that coexists with 'customer_sale:no_sale' and silently
    splits every transition/delta metric into two populations. So the
    validator converges: the full bilingual label, its Arabic half, and the
    colon-tightened twin normalize_tags would otherwise produce all map back
    to the canonical machine tag.
    """
    aliases: dict[str, str] = {}
    for entry in PREDEFINED_CUSTOMER_TAGS:
        tag, label = entry["tag"], entry["label"]
        arabic = label.split(" - ", 1)[1]
        aliases[label] = tag
        aliases[arabic] = tag
        if ":" in arabic:
            key, value = (part.strip() for part in arabic.split(":", 1))
            aliases[f"{key}:{value}"] = tag
    return aliases


_PREDEFINED_ALIASES = _label_aliases()


def split_tag(tag: str) -> tuple[str, str]:
    """(key, value) for a normalized tag. A bare key has value '' — the tag
    validator forbids an empty value on a key:value tag, so '' can only mean
    "bare key present" and never collides with a real value."""
    if ":" in tag:
        key, value = tag.split(":", 1)
        return key, value
    return tag, ""


def normalize_tags(v):
    """Validate and canonicalise a tag list.

    A tag is "key" or "key:value" — one optional colon, both sides non-empty
    after trimming. Commas are forbidden because the list-filter query param is
    CSV and array_to_string(tags, ',') backs the key-prefix filter; embedded
    whitespace is allowed for multi-word (e.g. Arabic) values. Tags are
    SINGLE-VALUED per key: a customer may not carry both "interest:interested"
    and "interest:not_interested", so a key's value is a well-defined thing that
    can transition — which is what the tag-change analytics count. None passes
    through: on update it means "clear", handled at the route.
    """
    if v is None:
        return v
    # Bound the INPUT length before walking it. The dedup below is a membership
    # scan, so an unbounded list is O(n²) — a ~100k-element body pins a worker
    # for tens of seconds. The final list can never exceed MAX_TAGS anyway, so
    # rejecting a longer input up front costs nothing real and closes the DoS.
    if len(v) > MAX_TAGS:
        raise ValueError(f"at most {MAX_TAGS} tags per customer")
    out: list[str] = []
    seen: set[str] = set()
    keys: set[str] = set()
    for raw in v:
        tag = str(raw).strip()
        if not tag:
            raise ValueError("empty tag")
        # converge visible catalog-label text to the machine tag BEFORE the
        # shape checks: a full bilingual label has two colons and would be
        # rejected, and the Arabic half would be accepted as an unrelated tag
        tag = _PREDEFINED_ALIASES.get(tag, tag)
        if len(tag) > MAX_TAG_LENGTH:
            raise ValueError(f"tag longer than {MAX_TAG_LENGTH} characters: {tag[:20]}…")
        if "," in tag:
            raise ValueError(f"tag may not contain a comma: {tag}")
        if tag.count(":") > 1:
            raise ValueError(f"tag may have at most one ':' (key or key:value): {tag}")
        if ":" in tag:
            key, value = (part.strip() for part in tag.split(":"))
            if not key or not value:
                raise ValueError(f"key and value must both be non-empty: {tag}")
            tag = f"{key}:{value}"
            # second alias pass: colon-tightening may only now have produced a
            # catalog spelling (e.g. 'بيع العميل:لا يوجد بيع' typed without the
            # display's space after the colon)
            tag = _PREDEFINED_ALIASES.get(tag, tag)
        if tag in seen:
            continue
        key = split_tag(tag)[0]
        # one value per key: "interest:interested" and "interest:not_interested"
        # cannot coexist. The clients replace same-key values in the editor, so a
        # well-behaved client never trips this; it is the API safety net.
        if key in keys:
            raise ValueError(f"at most one value per key: '{key}'")
        keys.add(key)
        seen.add(tag)
        out.append(tag)
    return out


class CustomerBase(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: str
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: CustomerCategory
    coordinates: Optional[str] = None
    created_by_uuid : Optional[str] = None
    # "key" or "key:value" labels; [] when the customer has none
    tags: Optional[List[str]] = None

    @field_validator("tags")
    def _tags_format(cls, v):
        return normalize_tags(v)

class CustomerCreate(CustomerBase):
    """What’s required when creating a new customer."""
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid


class CustomerUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    email_address: Optional[EmailStr] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[CustomerCategory] = None
    coordinates: Optional[str] = None
    # omitted = untouched (exclude_unset); [] or null = clear
    tags: Optional[List[str]] = None

    @field_validator("tags")
    def _tags_format(cls, v):
        return normalize_tags(v)

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid

class CustomerRead(CustomerBase):
    """What we return to clients."""
    model_config = ConfigDict(extra="forbid")

    uuid: str
    created_at: datetime
    is_deleted: bool
    balance_per_currency: dict[Currency, float]

    @field_validator("coordinates", mode="before")
    def _wkb_or_wkt_to_latlon(cls, v):
        """
        Accept any of:
        - WKTElement → v.data is WKT
        - WKBElement → convert via to_shape
        - bytes/bytearray → shapely.wkb.loads
        - str (WKT) → shapely.wkt.loads
        Then extract lat,lon and return "lat,lon".
        """
        if v is None:
            return v
        return wkt_or_wkb_to_lat_lon(v)  # This will raise BadRequestError if invalid




class CustomerReadList(BaseModel):
    """What we return to clients."""
    model_config = ConfigDict(extra="forbid")

    customers: list[CustomerRead]
    total_count: int



class CustomerListParams(BaseModel):
    """Pagination parameters for listing customers."""
    model_config = ConfigDict(extra="forbid")
    uuid: Optional[str] = None
    category: Optional[CustomerCategory] = None
    email_address: Optional[str] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    within_polygon: Optional[str] = None  # WKT Polygon string
    # "lat,lon" of a reference point (e.g. the driver's current location).
    # When set, results are ordered nearest-first and customers without a
    # saved location are excluded.
    near: Optional[str] = None
    # CSV of tags; a customer matches when it carries EVERY listed tag.
    # A bare key also matches any key:value of that key ("region" finds
    # "region:malki"), so keys work as families the way outcome prefixes do.
    tags: Optional[str] = None

    page: int = Field(1, gt=0, description="Page number, starting from 1")
    per_page: int = Field(20, gt=0, le=1000, description="Items per page, max 100")


class CustomerPage(BaseModel):
    """Paginated customer list response."""
    model_config = ConfigDict(extra="forbid")

    customers: List[CustomerRead] = Field(..., description="List of customers on this page")
    total_count: int = Field(..., description="Total number of customers")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")

# --------------------------- MAP CLUSTERS ---------------------------
#
# The map needs positions and counts, not customers. Serving it from the normal
# list endpoint is what made the app fall over: that route forces per_page to
# 10000 whenever `within_polygon` is set, and every row is a full CustomerRead
# whose `balance_per_currency` walks each order -> invoice -> items/payments/
# notes. Measured on local data: 574 bytes and 1.4 ms per customer, so 10k
# customers is ~5.7 MB and ~14 s for a single pan — and local order histories are
# sparse, so that is a floor. A phone parsing that repeatedly, once per pan, is
# the crash.
#
# So this is a separate, deliberately thin response: at most MAX_MAP_POINTS rows,
# each a position plus how many customers it stands for. Tapping a single pin
# fetches that one customer in full, which is the only place the expensive DTO is
# still needed.

# The cap the grid is sized to hit. See the route for the arithmetic that makes
# it a hard guarantee rather than a hope.
MAX_MAP_POINTS = 100


class CustomerMapClusterParams(BaseModel):
    """Which viewport to summarise, and the filters to summarise it under."""
    model_config = ConfigDict(extra="forbid")

    # WKT polygon of the visible region. Required: a map request without a
    # viewport is a request for everything, which is the bug this replaces.
    within_polygon: str
    # kept name-for-name with CustomerListParams so the same filter UI can drive
    # either endpoint without a translation layer
    category: Optional[CustomerCategory] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None


class CustomerMapCluster(BaseModel):
    """One pin: either a single customer or a group standing in for several."""
    model_config = ConfigDict(extra="forbid")

    latitude: float
    longitude: float
    # How many customers this pin represents. 1 means it is a real customer and
    # `customer_uuid`/`company_name` are populated; more than 1 means a cluster
    # and the position is the centroid of its members.
    count: int
    customer_uuid: Optional[str] = None
    company_name: Optional[str] = None
    # The real bounding box of this pin's members, which the client needs for two
    # distinct jobs. It is the zoom target when a cluster is tapped, and — more
    # importantly — a zero-span box is the exact signal that the members share a
    # coordinate and NO amount of zooming will ever separate them. Without it a
    # client can only guess, and tapping such a cluster strands the user zooming
    # forever on a pin that never splits. Four customers in the local database
    # share one point, so this is a real case, not a hypothetical.
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float


class CustomerMapClusterPage(BaseModel):
    """Every customer in the viewport is accounted for, even when clustered."""
    model_config = ConfigDict(extra="forbid")

    clusters: List[CustomerMapCluster]
    # Sum of every cluster's count — what the map can honestly claim to be
    # showing. Not a page total: nothing is truncated, only grouped.
    total_count: int
    # Grid cell size in degrees, so a client can tell how coarse the grouping is
    # (and so this is debuggable from a response body alone).
    cell_size_degrees: float
    max_points: int = MAX_MAP_POINTS


# --------------------------- TAG CHANGE HISTORY ---------------------------


class _TransitionSideFilters(BaseModel):
    """The from/to selectors shared by the rollup and the drill-down.

    Each side of a transition can be pinned three ways:
      * a value string ("interested"; "" matches a bare key present),
      * ABSENT (the key wasn't there) via from_absent / to_absent = true,
      * or left unset to mean "any".
    Absent is its own flag because a query param can't carry SQL NULL, and for a
    bare flag like "blacklist" absent<->present IS the whole story: who got it
    added is `from_absent=true`, who got it removed is `to_absent=true`.
    """

    from_value: Optional[str] = None
    to_value: Optional[str] = None
    from_absent: bool = False
    to_absent: bool = False

    @model_validator(mode="after")
    def _one_selector_per_side(self):
        if self.from_absent and self.from_value is not None:
            raise ValueError("pass at most one of from_value / from_absent")
        if self.to_absent and self.to_value is not None:
            raise ValueError("pass at most one of to_value / to_absent")
        return self


class TagTransitionParams(_TransitionSideFilters):
    """Which key's transitions to roll up, over which window."""
    model_config = ConfigDict(extra="forbid")

    # the tag key, e.g. "interest" — the family whose value changes we count
    key: str = Field(..., min_length=1, max_length=MAX_TAG_LENGTH)
    # inclusive ISO datetimes bounding when the change was recorded; both
    # optional (omit for all-time)
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


class TagTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # None = key absent (a set / a clear); "" = bare key present; else the value
    from_value: Optional[str] = None
    to_value: Optional[str] = None
    # DISTINCT customers who made this transition in the window ("how many
    # customers", not how many times)
    customers: int


class TagTransitionsResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    transitions: List[TagTransition]


class CustomerTagHistoryParams(BaseModel):
    """A single customer's tag changes, newest first."""
    model_config = ConfigDict(extra="forbid")

    page: int = Field(1, gt=0, le=1_000_000)
    per_page: int = Field(20, gt=0, le=100)


class CustomerTagHistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: str
    created_at: datetime
    created_by_uuid: Optional[str] = None
    change_group_uuid: str
    key: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None


class CustomerTagHistoryPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: List[CustomerTagHistoryItem]
    total_count: int
    page: int
    per_page: int
    pages: int


class TagTransitionCustomersParams(_TransitionSideFilters):
    """Which customers made one specific transition (key + from/to) — the
    drill-down behind a transition count. Same from/to selectors as the rollup
    (value, from_absent/to_absent, or unset = any)."""
    model_config = ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=MAX_TAG_LENGTH)
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    page: int = Field(1, gt=0, le=1_000_000)
    per_page: int = Field(20, gt=0, le=100)


class TagTransitionCustomer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_uuid: str
    company_name: str
    full_name: str
    # when this customer last made the transition in the window (a customer who
    # flip-flopped shows their most recent crossing)
    changed_at: datetime


class TagTransitionCustomersPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    from_value: Optional[str] = None
    to_value: Optional[str] = None
    customers: List[TagTransitionCustomer]
    total_count: int
    page: int
    per_page: int
    pages: int


# --------------------------- TAG NET DELTA (point-in-time) ---------------------------
#
# Transitions count MOVEMENTS (who went X -> Y). This instead compares the SET of
# customers HOLDING a tag at two instants — "blacklist held 40 on Aug 1 and 55 on
# Aug 31, +15, and here are the net-new ones". State at an instant is reconstructed
# by replaying the event log up to that moment (the value at T is the new_value of
# the latest event on that key at or before T). Forward-only: a tag set before the
# event log existed has no event to replay, so it reads as absent — negligible on a
# tenant whose tags all postdate the log, but real, hence documented.


class TagDeltaParams(BaseModel):
    """Holder-set delta for one tag between two instants."""
    model_config = ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=MAX_TAG_LENGTH)
    # which value's holders to track: a value ("" = bare key present) or omit to
    # mean "holds the key in ANY form" (present with any value)
    value: Optional[str] = None
    # the two instants to compare state at. as_of_start omitted = before all
    # history (nobody held it); as_of_end omitted = now.
    as_of_start: Optional[datetime] = None
    as_of_end: Optional[datetime] = None


class TagDeltaResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    value: Optional[str] = None
    as_of_start: Optional[datetime] = None
    as_of_end: datetime
    count_start: int
    count_end: int
    net_delta: int           # count_end - count_start (== added_count - removed_count)
    added_count: int         # held at end, not at start (net-new)
    removed_count: int       # held at start, not at end


class TagDeltaCustomersParams(BaseModel):
    """The net-new or net-gone customers behind a delta."""
    model_config = ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=MAX_TAG_LENGTH)
    value: Optional[str] = None
    as_of_start: Optional[datetime] = None
    as_of_end: Optional[datetime] = None
    # which side of the delta to list
    direction: str = Field(..., pattern="^(added|removed)$")
    page: int = Field(1, gt=0, le=1_000_000)
    per_page: int = Field(20, gt=0, le=100)


class TagDeltaCustomer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_uuid: str
    company_name: str
    full_name: str


class TagDeltaCustomersPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    value: Optional[str] = None
    direction: str
    customers: List[TagDeltaCustomer]
    total_count: int
    page: int
    per_page: int
    pages: int
