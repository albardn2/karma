"""Deriving customer tags from what actually happened.

Reps tag customers by hand, but the tags that drive distribution analytics —
"has this customer ever bought", "are they interested" — are answers the system
already knows from orders and trip-stop outcomes. This module derives those,
so the analytics are a by-product of doing the work rather than a discipline
nobody keeps up.

Three triggers write through here (each cites this module):
  * customer created           -> customer_sale:no_sale
  * customer order created     -> customer_sale:one_time_sale | :repeated_sale,
                                  and customer_interest:interested
  * trip stop completed        -> customer_interest from the outcome family,
                                  plus the blacklist / prioritize_next_stop flags,
                                  and it SPENDS prioritize_next_stop once the
                                  visit it asked for has happened

Two rules hold everywhere:

1. AUTOMATIC WINS ON ITS OWN KEY. Tags are single-valued per key, so writing
   customer_interest:interested replaces whatever that key held, manual or not.
   That is the point: the derived keys describe observed behaviour, and an
   order placed today outranks an opinion recorded last month. Keys nobody
   derives (agent, skip_distribution, and any custom tag) are never touched.

2. A TAG NEVER BREAKS THE WRITE IT RIDES ALONG WITH. These run inside the same
   transaction as the order or the stop completion. If a tag cannot be applied
   (the customer is at the tag cap, or there is no customer at all), it is
   skipped silently — a sale must never fail to record because of a label.
"""
from app.dto.customer import MAX_TAGS, split_tag
from app.domains.customer.tag_history import record_tag_changes

# The derived tags, spelled once. These are the machine strings from
# PREDEFINED_CUSTOMER_TAGS (app/dto/customer.py) — the clients translate them
# for display, and the tag analytics group on exactly these values, so they are
# data: renaming one orphans every customer already carrying it.
SALE_KEY = "customer_sale"
INTEREST_KEY = "customer_interest"

SALE_NONE = f"{SALE_KEY}:no_sale"
SALE_ONE_TIME = f"{SALE_KEY}:one_time_sale"
SALE_REPEATED = f"{SALE_KEY}:repeated_sale"
INTEREST_YES = f"{INTEREST_KEY}:interested"
INTEREST_NO = f"{INTEREST_KEY}:not_interested"
BLACKLIST_TAG = "blacklist"
PRIORITIZE_TAG = "prioritize_next_stop"


def outcome_machine_key(outcome) -> str:
    """The machine half of a trip-stop outcome.

    Outcomes are stored as the whole bilingual TripStopOutcome string
    ("interested:have_inventory - مهتم: لديه مخزون"), so the key is what precedes
    the FIRST " - ". Splitting once matters: several Arabic halves contain their
    own separators, and rsplit or a bare split would take a bite out of them.
    Legacy rows hold NULL or '' — both yield '', meaning "says nothing".
    """
    if not outcome:
        return ""
    return outcome.split(" - ", 1)[0].strip()


def tags_for_outcome(outcome) -> list[str]:
    """Which tags a completed stop implies, in the order they should be applied.

    Classification is by FAMILY (the part before ':'), never by the full string,
    so the outcome list can grow new reasons — a fifth way to be not_interested —
    without anyone remembering to update this. That mirrors how the customer
    analytics filter already matches outcomes by prefix.

      sale, interested:*        -> interested
      not_interested:*, blacklist -> not interested
      skipped:*                 -> nothing: a stop nobody answered says nothing
                                   about the customer, and overwriting a real
                                   verdict with silence would lose information

    Two outcomes additionally raise a flag of their own, because they are
    statements about how to treat the customer next time rather than about this
    visit: blacklist, and interested:prioritize_next_visit.
    """
    key = outcome_machine_key(outcome)
    if not key:
        return []
    family = key.split(":", 1)[0]

    tags: list[str] = []
    if family in ("sale", "interested"):
        tags.append(INTEREST_YES)
    elif family in ("not_interested", "blacklist"):
        tags.append(INTEREST_NO)

    if family == "blacklist":
        tags.append(BLACKLIST_TAG)
    if key == "interested:prioritize_next_visit":
        tags.append(PRIORITIZE_TAG)
    return tags


# the sale key is a LADDER, and it only ever climbs
_SALE_RANK = {SALE_NONE: 0, SALE_ONE_TIME: 1, SALE_REPEATED: 2}


def sale_tag_for_order(customer, *, bought_before: bool) -> list[str]:
    """The customer_sale value an order implies — unless the customer already
    carries a stronger one.

    An order proves "has bought at least once". That is weaker than "buys
    repeatedly", so it must not overwrite it: a customer onboarded as a known
    repeat buyer (which create deliberately preserves, see with_default_sale_tag)
    would otherwise be demoted to one-time by their first order in this system,
    then promoted again by their second. The funnel analytics would show one
    customer converting twice, in opposite directions, neither of which
    happened. An unrecognised value is treated as no rank and gets replaced.

    This is the one derived key where automatic does NOT simply win: elsewhere
    the derivation is better evidence than what it replaces, but here it is
    strictly less informed.
    """
    tag = SALE_REPEATED if bought_before else SALE_ONE_TIME
    current = next(
        (t for t in (customer.tags or []) if split_tag(t)[0].lower() == SALE_KEY),
        None,
    )
    if current is not None and _SALE_RANK.get(current, -1) >= _SALE_RANK[tag]:
        return []
    return [tag]


# the families that mean a rep actually reached the customer and formed a view
_VERDICT_FAMILIES = ("sale", "interested", "not_interested", "blacklist")


def tags_cleared_by_outcome(outcome) -> list[str]:
    """Which flags a completed stop SPENDS.

    prioritize_next_stop means "see this customer sooner next round". The visit
    it was asking for is this one, so recording a verdict here uses it up. Left
    to accumulate it would end up on everyone who ever got that outcome, and a
    flag that is set on everybody points at nobody.

    Two cases deliberately do not spend it:

      * interested:prioritize_next_visit — the rep is asking for priority AGAIN.
        tags_for_outcome re-raises the flag for exactly this outcome, so it must
        not be cleared in the same breath.
      * skipped:* — the visit did not happen. The customer was out, or there was
        no time. Clearing here would quietly drop their priority without anyone
        having spoken to them, which is the very thing the flag exists to
        prevent, and it matches the rule that a skipped stop changes nothing.
    """
    key = outcome_machine_key(outcome)
    if not key:
        return []
    if key.split(":", 1)[0] not in _VERDICT_FAMILIES:
        return []
    if key == "interested:prioritize_next_visit":
        return []
    return [PRIORITIZE_TAG]


def with_default_sale_tag(tags) -> list[str]:
    """The tag list a brand-new customer starts with: nobody has bought yet.

    Pure, because the customer row does not exist yet at the point the create
    route needs this — seeding the list before the INSERT lets the route's
    existing record_tag_changes call log the tag as a real (absent -> no_sale)
    event, so the very first data point of every customer's sale history is
    there without a second write.

    An explicit customer_sale value in the request wins: a customer being
    entered because they already buy should not be filed as a non-buyer.
    """
    tags = list(tags or [])
    if any(split_tag(t)[0].lower() == SALE_KEY for t in tags):
        return tags
    if len(tags) >= MAX_TAGS:
        return tags
    return tags + [SALE_NONE]


def apply_auto_tags(uow, *, customer, tags=(), clear=(), actor_uuid=None) -> list[str]:
    """Apply derived tags to `customer`: set each of `tags`, replacing any
    existing value of its key, and remove each key named in `clear`.

    Returns the tags SET (a removal is visible on customer.tags, not here).
    Nothing is committed: the caller's unit of work owns the transaction, so the
    tag, its history event, and the order or stop completion that caused it all
    land together or not at all.

    Skipped, deliberately and silently:
      * no customer (a stop can be repointed to have none)
      * a tag whose exact value is already present — no write, no event
      * a key in `clear` the customer does not carry
      * a NEW key on a customer already holding MAX_TAGS tags. Replacing an
        existing key never grows the list, so this only bites the genuinely full
        customer, and the alternative — failing the order — is far worse.
    """
    if customer is None:
        return []
    tags = list(tags or [])
    # setting a key wins over clearing it, so a caller that both raises and
    # spends a flag in one call cannot depend on argument order
    set_keys = {split_tag(t)[0].lower() for t in tags}
    clear = [t for t in (clear or []) if split_tag(t)[0].lower() not in set_keys]
    if not tags and not clear:
        return []

    old = list(customer.tags or [])
    new = list(old)
    applied: list[str] = []

    for tag in tags:
        if tag in new:
            continue
        key = split_tag(tag)[0].lower()
        # keys compare case-insensitively, as both tag editors do, so a manually
        # typed "Blacklist" is replaced rather than left beside "blacklist"
        without = [t for t in new if split_tag(t)[0].lower() != key]
        if len(without) == len(new) and len(new) >= MAX_TAGS:
            continue
        new = without + [tag]
        applied.append(tag)

    for tag in clear:
        key = split_tag(tag)[0].lower()
        new = [t for t in new if split_tag(t)[0].lower() != key]

    # compare against the list we started with rather than trusting `applied`:
    # a call that only spent a flag still has to be written
    if new == old:
        return []

    # REASSIGN, never mutate in place: customer.tags is a plain ARRAY(String)
    # column with no MutableList wrapper (models/common.py), so appending to the
    # existing list leaves SQLAlchemy blind to the change and the write vanishes
    # at flush with no error anywhere.
    customer.tags = new
    uow.customer_repository.save(model=customer, commit=False)
    record_tag_changes(
        uow,
        customer_uuid=customer.uuid,
        # the customer's own account, not the caller's: correct even when this
        # runs outside a request context, where uow.account_uuid is None
        account_uuid=customer.account_uuid,
        created_by_uuid=actor_uuid,
        old_tags=old,
        new_tags=new,
    )
    return applied
