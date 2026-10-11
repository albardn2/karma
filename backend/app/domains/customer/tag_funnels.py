"""The two customer funnels the distribution team steers by — where every live
customer stands today, and how a window of time moved them.

    sale:      no_sale -> one_time_sale -> repeated_sale    (key customer_sale)
    interest:  unknown -> not_interested -> interested      (key customer_interest)

"Unknown" is a real step of the interest funnel: a customer nobody has formed
a view on yet carries no customer_interest tag at all, and every new customer
starts there. The sale funnel has no such step — a customer created since the
derived tags exist starts at no_sale (see with_default_sale_tag), so a
customer with no sale tag is a legacy row the funnel cannot place. Those are
reported as `outside` rather than guessed at.

Two sources, deliberately kept apart:

  * CURRENT comes from customer.tags — the truth about where customers stand.
  * CHANGE comes from customer_tag_event — the append-only log of every move.
    Per step, net change = moves INTO it minus moves OUT of it inside the
    window. The moves themselves are kept too, so the client can label the
    arrow between two steps ("50 went from no sale to one-time").

Both count LIVE customers only. A customer deleted inside the window drops out
of the current numbers, so their moves must drop out of the change numbers as
well — otherwise the two halves of the same card disagree about the same
customers. The route joins the event log to live customers for exactly this.

Everything here is pure: the route fetches rows, this module does the
arithmetic, and the tests exercise the arithmetic without a database.
"""
from collections import Counter, defaultdict

from app.domains.customer.auto_tags import (
    INTEREST_KEY,
    INTEREST_NO,
    INTEREST_YES,
    SALE_KEY,
    SALE_NONE,
    SALE_ONE_TIME,
    SALE_REPEATED,
)
from app.dto.customer import split_tag


def _value_of(tag: str) -> str:
    return split_tag(tag)[1]


# The steps of each funnel in order, as the VALUE half of the tag — which is
# what the event log stores (key and value in separate columns). None means
# "carries no tag for this key". Derived from the catalog constants so a
# renamed tag cannot leave the funnel counting a value nobody writes any more.
SALE_STEPS = tuple(_value_of(t) for t in (SALE_NONE, SALE_ONE_TIME, SALE_REPEATED))
INTEREST_STEPS = (None,) + tuple(_value_of(t) for t in (INTEREST_NO, INTEREST_YES))

# Every tag either funnel places — what the route fetches customers by. A
# customer whose tags overlap none of these stands on no step of either funnel
# (for interest that means Unknown), so their row never needs to leave the
# database; the total alone accounts for them.
FUNNEL_TAGS = (SALE_NONE, SALE_ONE_TIME, SALE_REPEATED, INTEREST_NO, INTEREST_YES)

# The rolling windows the client offers, in days. Rolling rather than calendar
# periods because the question is "what changed over the last month", asked on
# any day of the month.
WINDOW_DAYS = {"week": 7, "month": 30, "quarter": 91, "year": 365}
DEFAULT_WINDOW = "month"


def resolve_window(raw) -> tuple[str, int]:
    """(name, days) for a client-supplied window; an unknown name falls back
    to the default rather than rejecting — a stale client is not a 4xx."""
    name = (raw or "").strip().lower()
    if name not in WINDOW_DAYS:
        name = DEFAULT_WINDOW
    return name, WINDOW_DAYS[name]


_MISSING = object()


def current_values(tag_lists, key: str, total: int) -> Counter:
    """{value: how many customers hold key:value}, with None for the customers
    carrying no tag for the key at all.

    `total` is the number of live customers. `tag_lists` may be only those
    whose tags overlap FUNNEL_TAGS (that is all the route fetches), so the
    None count is derived: everyone not seen holding the key.

    Keys match EXACTLY, as the event log does — record_tag_changes stores the
    key as typed and the route filters events on the exact key — so a
    strangely-cased manual tag is ignored by both halves alike rather than
    counted by one and not the other. A legacy row that somehow holds the key
    twice counts once, at its last value, the same last-wins rule the event
    log applies.
    """
    out: Counter = Counter()
    with_key = 0
    for tags in tag_lists:
        value = _MISSING
        for tag in tags or []:
            k, v = split_tag(tag)
            if k == key:
                value = v
        if value is not _MISSING:
            out[value] += 1
            with_key += 1
    out[None] = max(0, total - with_key)
    return out


def build_funnel(steps, *, current: Counter, moves, created: int = 0) -> dict:
    """One funnel's steps, each with its current count and how the window
    moved it, plus the step-to-step moves themselves.

    steps:    the funnel's values in order (None = no tag for the key).
    current:  current_values() for the key.
    moves:    (old_value, new_value, count) rows for the key inside the window,
              live customers only.
    created:  live customers created inside the window. Creating a customer
              writes no event for a key it does not set, so for a funnel whose
              steps include "no tag" the newcomers arrive on that step silently
              and are added here; a funnel without that step ignores it.

    Per step: net_change = moves in - moves out; `entered` and `left` count the
    moves across the funnel's edge (from or to a value that is not a step —
    the sale funnel's absent->no_sale on creation is an entry, a manually
    removed tag is an exit). Moves between two steps are returned in
    `transitions`, largest first, so the client can label the arrows.
    """
    step_set = set(steps)
    net: dict = defaultdict(int)
    entered: dict = defaultdict(int)
    left: dict = defaultdict(int)
    transitions: Counter = Counter()

    for old, new, n in moves:
        if old == new or not n:
            continue
        old_in, new_in = old in step_set, new in step_set
        if old_in:
            net[old] -= n
        if new_in:
            net[new] += n
        if old_in and new_in:
            transitions[(old, new)] += n
        elif new_in:
            entered[new] += n
        elif old_in:
            left[old] += n

    if None in step_set and created:
        net[None] += created
        entered[None] += created

    return {
        "steps": [
            {
                "value": v,
                "current": current.get(v, 0),
                "net_change": net[v],
                "entered": entered[v],
                "left": left[v],
            }
            for v in steps
        ],
        "transitions": [
            {"from": old, "to": new, "count": n}
            for (old, new), n in sorted(transitions.items(), key=lambda kv: -kv[1])
        ],
        # live customers the funnel cannot place: no tag where a step is
        # expected, or a value that is not a step
        "outside": sum(n for v, n in current.items() if v not in step_set),
    }


def build_payload(*, window: str, days: int, since, until, total: int, tag_lists, moves, created: int) -> dict:
    """The whole response: both funnels over the same customers and window.

    total:     live customers in the tenant.
    tag_lists: one tag list per live customer holding any FUNNEL_TAGS tag.
    moves:     (key, old_value, new_value, count) rows inside the window.
    """
    by_key: dict = defaultdict(list)
    for key, old, new, n in moves:
        by_key[key].append((old, new, n))

    return {
        "window": window,
        "days": days,
        "since": since.isoformat(),
        "until": until.isoformat(),
        "total_customers": total,
        "new_customers": created,
        "funnels": {
            "sale": {
                "key": SALE_KEY,
                **build_funnel(
                    SALE_STEPS,
                    current=current_values(tag_lists, SALE_KEY, total),
                    moves=by_key[SALE_KEY],
                    created=created,
                ),
            },
            "interest": {
                "key": INTEREST_KEY,
                **build_funnel(
                    INTEREST_STEPS,
                    current=current_values(tag_lists, INTEREST_KEY, total),
                    moves=by_key[INTEREST_KEY],
                    created=created,
                ),
            },
        },
    }
