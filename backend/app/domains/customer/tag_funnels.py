"""The two customer funnels the distribution team steers by — where every live
customer stands, and how a calendar period moved them.

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
    period. The moves themselves are kept too, so the client can label the
    arrow between two steps ("50 went from no sale to one-time").

For a period that is already over, the count shown is where customers stood
at its END, not today: today's count minus every move logged after the
period. Derived rather than replayed, because the identity (count at T =
count now − net moves since T) holds over exactly the log the net change is
read from — so a step's number and its badge can never disagree.

Both count LIVE customers only. A customer deleted inside the period drops out
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

# Calendar periods — the week, month, quarter or year containing a day, cut
# exactly as the other dashboards cut time — and how far back the ‹ › navigator
# may step in each. "What changed in September" is the question, not "in the
# last 30 days": a period a reader can name, compare, and close the books on.
GRANULARITIES = ("week", "month", "quarter", "year")
DEFAULT_GRANULARITY = "month"
MAX_OFFSET = {"week": 104, "month": 36, "quarter": 12, "year": 5}


def resolve_period_params(raw_granularity, raw_offset) -> tuple[str, int]:
    """(granularity, offset) from the query string. Offset 0 is the period
    containing today, 1 the one before it, and so on, capped per granularity.
    Unknown or malformed values fall back rather than reject — a stale client
    is not a 4xx."""
    gran = (raw_granularity or "").strip().lower()
    if gran not in GRANULARITIES:
        gran = DEFAULT_GRANULARITY
    try:
        offset = int(raw_offset or 0)
    except (TypeError, ValueError):
        offset = 0
    return gran, max(0, min(MAX_OFFSET[gran], offset))


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


def _tally(step_set, moves, created: int):
    """Per-step movement over one stretch of the log: (net, entered, left,
    transitions). See build_funnel for what each means."""
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
    return net, entered, left, transitions


def build_funnel(steps, *, current: Counter, moves, created: int = 0,
                 moves_after=(), created_after: int = 0) -> dict:
    """One funnel's steps, each with where it stood and how the period moved
    it, plus the step-to-step moves themselves.

    steps:          the funnel's values in order (None = no tag for the key).
    current:        current_values() for the key — today's counts.
    moves:          (old_value, new_value, count) rows for the key inside the
                    period, live customers only.
    created:        live customers created inside the period. Creating a
                    customer writes no event for a key it does not set, so for
                    a funnel whose steps include "no tag" the newcomers arrive
                    on that step silently and are added here; a funnel without
                    that step ignores it.
    moves_after /   the same two, for everything logged AFTER the period's end.
    created_after:  Empty for the current period (it ends now). For a finished
                    period they turn today's counts into the counts at its end.

    Per step: net_change = moves in - moves out inside the period; `entered`
    and `left` count the moves across the funnel's edge (from or to a value
    that is not a step — the sale funnel's absent->no_sale on creation is an
    entry, a manually removed tag is an exit); `at_period_end` = current minus
    the net of everything after. Moves between two steps are returned in
    `transitions`, largest first, so the client can label the arrows.
    """
    step_set = set(steps)
    net, entered, left, transitions = _tally(step_set, moves, created)
    net_after, _, _, _ = _tally(step_set, moves_after, created_after)

    def step(v):
        # never below zero: a log that contradicts the tags (events predating
        # a manual fix, say) must not render as "-3 customers"
        end = max(0, current.get(v, 0) - net_after[v])
        return {
            "value": v,
            "current": current.get(v, 0),
            "at_period_end": end,
            # where the step stood when the period began: its end minus what
            # the period did to it — the "before" a trip page shows
            "at_period_start": max(0, end - net[v]),
            "net_change": net[v],
            "entered": entered[v],
            "left": left[v],
        }

    return {
        "steps": [step(v) for v in steps],
        "transitions": [
            {"from": old, "to": new, "count": n}
            for (old, new), n in sorted(transitions.items(), key=lambda kv: -kv[1])
        ],
        # live customers the funnel cannot place: no tag where a step is
        # expected, or a value that is not a step
        "outside": sum(n for v, n in current.items() if v not in step_set),
    }


def _by_key(rows) -> dict:
    """(key, old, new, count) rows -> {key: [(old, new, count)]}."""
    out: dict = defaultdict(list)
    for key, old, new, n in rows:
        out[key].append((old, new, n))
    return out


def build_payload(*, period: dict, history_from, total: int, tag_lists,
                  moves, moves_after, created: int, created_after: int) -> dict:
    """The whole response: both funnels over the same customers and period.

    period:        the client-facing description of the calendar period
                   (granularity, offset, label, start, end, is_current).
    history_from:  when this tenant's tag log begins (None if empty). A period
                   before it can show no movement, and the client says so.
    total:         live customers in the tenant.
    tag_lists:     one tag list per live customer holding any FUNNEL_TAGS tag.
    moves:         (key, old_value, new_value, count) rows inside the period.
    moves_after:   the same for everything logged after the period's end.
    created:       live customers created inside the period.
    created_after: live customers created after it.
    """
    inside, after = _by_key(moves), _by_key(moves_after)
    # live customers created after the period did not exist at its end
    total_end = max(0, total - created_after)

    def funnel(key, steps):
        f = build_funnel(
            steps,
            current=current_values(tag_lists, key, total),
            moves=inside[key],
            created=created,
            moves_after=after[key],
            created_after=created_after,
        )
        # everyone alive at the period's end was either on a step or outside
        # the funnel — so the card's footnote can speak of the same moment as
        # its steps instead of mixing today's untagged count into a past month
        f["outside_at_period_end"] = max(0, total_end - sum(s["at_period_end"] for s in f["steps"]))
        return {"key": key, **f}

    return {
        "period": period,
        "history_from": history_from.isoformat() if history_from else None,
        "total_customers": total,
        "total_at_period_end": total_end,
        "new_customers": created,
        "funnels": {
            "sale": funnel(SALE_KEY, SALE_STEPS),
            "interest": funnel(INTEREST_KEY, INTEREST_STEPS),
        },
    }
