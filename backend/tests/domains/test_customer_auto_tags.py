"""Tags the system derives for itself, from orders and from trip-stop outcomes.

Reps will not maintain a tag by hand for every customer, so the tags the
distribution analytics actually run on are derived: a customer starts as a
non-buyer, an order proves they buy and are interested, and the outcome a rep
already picks at a stop decides their interest. What this file pins is the part
that is easy to break silently later.

Three things earn a test:

  1. THE CLASSIFICATION IS BY FAMILY, NOT BY STRING. Outcomes are stored as the
     whole bilingual value ("not_interested:bad_product - غير مهتم: منتج سيئ"),
     and the list grows — a fifth reason to be not_interested gets added and
     nobody revisits this module. So there is a case over EVERY member of
     TripStopOutcome: add an option without deciding what it means for the
     customer and this fails, which is the only moment anyone will think about it.

  2. THE DERIVED VALUES ARE REAL CATALOG TAGS. The tags written here are the
     machine strings the clients translate and the tag analytics group on. A
     typo would store a tag no chart counts and no picker shows, with no error
     anywhere — so every value this module can produce is checked against
     PREDEFINED_CUSTOMER_TAGS and against the tag validator itself.

  3. A TAG NEVER BREAKS THE WRITE IT RIDES ALONG WITH. These run inside the
     order's own transaction. The cap and the missing-customer cases must skip,
     not raise.

The array-reassignment rule (customer.tags is a plain ARRAY column with no
MutableList wrapper, so in-place mutation is invisible to SQLAlchemy) is pinned
here too — that one fails by losing writes with no error at all.
"""
import pytest

from app.domains.customer.auto_tags import (
    BLACKLIST_TAG,
    INTEREST_NO,
    INTEREST_YES,
    PRIORITIZE_TAG,
    SALE_NONE,
    SALE_ONE_TIME,
    SALE_REPEATED,
    apply_auto_tags,
    outcome_machine_key,
    sale_tag_after_void,
    sale_tag_for_live_order_count,
    sale_tag_for_order,
    tags_cleared_by_outcome,
    tags_for_outcome,
    with_default_sale_tag,
)
from app.domains.task_execution.workflow_operators.create_trip_operator import (
    TripStopOutcome,
)
from app.dto.customer import MAX_TAGS, PREDEFINED_CUSTOMER_TAGS, normalize_tags


# --- fakes: just enough unit of work to see what was written ---------------

class _FakeSession:
    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)


class _FakeRepo:
    def __init__(self):
        self.saved = []

    def save(self, model, commit=False):
        self.saved.append(model)


class _FakeUow:
    def __init__(self):
        self.session = _FakeSession()
        self.customer_repository = _FakeRepo()


class _Customer:
    def __init__(self, *tags):
        self.uuid = "cust-1"
        self.account_uuid = "acct-1"
        self.tags = list(tags)


def _apply(customer, tags=(), clear=(), actor="user-1"):
    uow = _FakeUow()
    written = apply_auto_tags(uow, customer=customer, tags=tags, clear=clear, actor_uuid=actor)
    return uow, written


# --- 1. every outcome is classified ----------------------------------------
#
# The expectation is written out per member rather than computed from the same
# family rule the implementation uses — a rule compared against itself passes
# even when the rule is wrong.

EXPECTED_BY_OUTCOME = {
    TripStopOutcome.SALE: [INTEREST_YES],
    TripStopOutcome.INTERESTED_HAVE_INVENTORY: [INTEREST_YES],
    TripStopOutcome.INTERESTED_NEEDS_BETTER_PRICE: [INTEREST_YES],
    TripStopOutcome.INTERESTED_INSUFFICIENT_FUNDS: [INTEREST_YES],
    TripStopOutcome.INTERESTED_PRIORITIZE_NEXT_VISIT: [INTEREST_YES, PRIORITIZE_TAG],
    TripStopOutcome.NOT_INTERESTED_COMPETITOR: [INTEREST_NO],
    TripStopOutcome.NOT_INTERESTED_BAD_PRODUCT: [INTEREST_NO],
    TripStopOutcome.NOT_INTERSTED_PRICE_TOO_HIGH: [INTEREST_NO],
    TripStopOutcome.NOT_INTERESTED_OTHER: [INTEREST_NO],
    # a stop nobody got an answer at says nothing about the customer; tagging
    # them not_interested would erase a real verdict from a previous visit
    TripStopOutcome.SKIPPED_CUSTOMER_NOT_AVAILABLE: [],
    TripStopOutcome.SKIPPED_VEHICLE_BREAKDOWN: [],
    TripStopOutcome.SKIPPED_NO_PARKING: [],
    TripStopOutcome.SKIPPED_NO_TIME: [],
    TripStopOutcome.SKIPPED_OTHER: [],
    TripStopOutcome.BLACKLIST: [INTEREST_NO, BLACKLIST_TAG],
}


def test_every_outcome_has_a_decided_meaning():
    """A new outcome option must not slip in unclassified."""
    assert set(EXPECTED_BY_OUTCOME) == set(TripStopOutcome), (
        "TripStopOutcome changed: decide what the new option means for the "
        "customer's tags and add it to EXPECTED_BY_OUTCOME"
    )


@pytest.mark.parametrize("outcome", list(TripStopOutcome), ids=lambda o: o.name)
def test_outcome_classification(outcome):
    assert tags_for_outcome(outcome.value) == EXPECTED_BY_OUTCOME[outcome]


def test_blacklist_outcome_both_marks_and_records_disinterest():
    """The two halves are separate facts: a blacklisted customer is flagged AND
    is not interested, so an interest report and a blacklist report agree."""
    tags = tags_for_outcome(TripStopOutcome.BLACKLIST.value)
    assert BLACKLIST_TAG in tags and INTEREST_NO in tags


# --- what a stop RETIRES ----------------------------------------------------
#
# Both bare flags are answered by the next real visit. prioritize_next_stop asks
# for that visit to come sooner, so a verdict there uses it up. blacklist is
# retired by any verdict that is not itself a blacklist: the rep standing in
# front of the customer has newer information than whoever set the flag.

SPENT_BY_OUTCOME = {
    TripStopOutcome.SALE: [PRIORITIZE_TAG, BLACKLIST_TAG],
    TripStopOutcome.INTERESTED_HAVE_INVENTORY: [PRIORITIZE_TAG, BLACKLIST_TAG],
    TripStopOutcome.INTERESTED_NEEDS_BETTER_PRICE: [PRIORITIZE_TAG, BLACKLIST_TAG],
    TripStopOutcome.INTERESTED_INSUFFICIENT_FUNDS: [PRIORITIZE_TAG, BLACKLIST_TAG],
    # asking for priority again must not spend the flag it is re-raising, but it
    # is still a visit, so it still retires a blacklist
    TripStopOutcome.INTERESTED_PRIORITIZE_NEXT_VISIT: [BLACKLIST_TAG],
    # a refusal is newer information too — one of these un-blacklists someone,
    # which is the accepted cost of keeping the flag current
    TripStopOutcome.NOT_INTERESTED_COMPETITOR: [PRIORITIZE_TAG, BLACKLIST_TAG],
    TripStopOutcome.NOT_INTERESTED_BAD_PRODUCT: [PRIORITIZE_TAG, BLACKLIST_TAG],
    TripStopOutcome.NOT_INTERSTED_PRICE_TOO_HIGH: [PRIORITIZE_TAG, BLACKLIST_TAG],
    TripStopOutcome.NOT_INTERESTED_OTHER: [PRIORITIZE_TAG, BLACKLIST_TAG],
    # nobody reached the customer, so neither flag has been answered
    TripStopOutcome.SKIPPED_CUSTOMER_NOT_AVAILABLE: [],
    TripStopOutcome.SKIPPED_VEHICLE_BREAKDOWN: [],
    TripStopOutcome.SKIPPED_NO_PARKING: [],
    TripStopOutcome.SKIPPED_NO_TIME: [],
    TripStopOutcome.SKIPPED_OTHER: [],
    # re-stating the blacklist must not retire it
    TripStopOutcome.BLACKLIST: [PRIORITIZE_TAG],
}


def test_every_outcome_has_a_decided_spend():
    assert set(SPENT_BY_OUTCOME) == set(TripStopOutcome), (
        "TripStopOutcome changed: decide whether the new option retires "
        "prioritize_next_stop and/or blacklist, and add it to SPENT_BY_OUTCOME"
    )


def test_a_sale_retires_a_blacklist():
    """Buying is the strongest counter-evidence there is."""
    outcome = TripStopOutcome.SALE.value
    customer = _Customer(BLACKLIST_TAG, INTEREST_NO)
    uow, _ = _apply(customer, tags=tags_for_outcome(outcome),
                    clear=tags_cleared_by_outcome(outcome))
    assert BLACKLIST_TAG not in customer.tags
    assert INTEREST_YES in customer.tags
    assert ("blacklist", "", None) in {
        (e.key, e.old_value, e.new_value) for e in uow.session.added
    }


def test_a_refusal_also_retires_a_blacklist():
    """The accepted cost of keeping the flag current: one not_interested visit
    un-blacklists someone. They stay not_interested — the two are separate
    facts, and only the flag is retired."""
    outcome = TripStopOutcome.NOT_INTERESTED_OTHER.value
    customer = _Customer(BLACKLIST_TAG)
    _apply(customer, tags=tags_for_outcome(outcome), clear=tags_cleared_by_outcome(outcome))
    assert customer.tags == [INTEREST_NO]


def test_restating_the_blacklist_does_not_retire_it():
    """set beats clear on the same key, so the add and the retire cannot fight
    even though a blacklist outcome is itself a verdict."""
    outcome = TripStopOutcome.BLACKLIST.value
    customer = _Customer(BLACKLIST_TAG)
    _apply(customer, tags=tags_for_outcome(outcome), clear=tags_cleared_by_outcome(outcome))
    assert BLACKLIST_TAG in customer.tags


def test_a_skipped_stop_leaves_a_blacklist_alone():
    """Nobody reached the customer, so there is no newer information."""
    outcome = TripStopOutcome.SKIPPED_CUSTOMER_NOT_AVAILABLE.value
    customer = _Customer(BLACKLIST_TAG)
    uow, _ = _apply(customer, tags=tags_for_outcome(outcome),
                    clear=tags_cleared_by_outcome(outcome))
    assert customer.tags == [BLACKLIST_TAG]
    assert uow.session.added == []


def test_retiring_a_blacklist_leaves_manual_tags_alone():
    customer = _Customer(BLACKLIST_TAG, "agent", "region:malki")
    outcome = TripStopOutcome.SALE.value
    _apply(customer, tags=tags_for_outcome(outcome), clear=tags_cleared_by_outcome(outcome))
    assert set(customer.tags) == {"agent", "region:malki", INTEREST_YES}


@pytest.mark.parametrize("outcome", list(TripStopOutcome), ids=lambda o: o.name)
def test_outcome_spend(outcome):
    assert tags_cleared_by_outcome(outcome.value) == SPENT_BY_OUTCOME[outcome]


@pytest.mark.parametrize("outcome", [None, "", "unknown:thing - نص"])
def test_unreadable_outcome_spends_nothing(outcome):
    assert tags_cleared_by_outcome(outcome) == []


def test_a_visit_spends_the_priority_flag():
    customer = _Customer(PRIORITIZE_TAG, "customer_interest:interested", "agent")
    uow, _ = _apply(
        customer,
        tags=tags_for_outcome(TripStopOutcome.SALE.value),
        clear=tags_cleared_by_outcome(TripStopOutcome.SALE.value),
    )
    assert PRIORITIZE_TAG not in customer.tags
    # the manual tag is untouched, and the removal is in the history
    assert "agent" in customer.tags
    assert ("prioritize_next_stop", "", None) in {
        (e.key, e.old_value, e.new_value) for e in uow.session.added
    }


def test_asking_for_priority_again_does_not_spend_it():
    """The re-raise and the spend must not cancel out on the same stop."""
    outcome = TripStopOutcome.INTERESTED_PRIORITIZE_NEXT_VISIT.value
    customer = _Customer(PRIORITIZE_TAG)
    _apply(customer, tags=tags_for_outcome(outcome), clear=tags_cleared_by_outcome(outcome))
    assert PRIORITIZE_TAG in customer.tags


def test_a_skipped_stop_leaves_the_priority_owed():
    outcome = TripStopOutcome.SKIPPED_NO_TIME.value
    customer = _Customer(PRIORITIZE_TAG)
    uow, _ = _apply(customer, tags=tags_for_outcome(outcome), clear=tags_cleared_by_outcome(outcome))
    assert customer.tags == [PRIORITIZE_TAG]
    assert uow.session.added == []


def test_spending_a_flag_the_customer_lacks_writes_nothing():
    customer = _Customer("customer_interest:interested")
    uow, _ = _apply(customer, tags=[INTEREST_YES], clear=[PRIORITIZE_TAG])
    assert uow.session.added == []
    assert uow.customer_repository.saved == []


def test_a_clear_alone_is_still_persisted():
    """The write must not be gated on something having been SET."""
    customer = _Customer(PRIORITIZE_TAG)
    uow, written = _apply(customer, tags=[], clear=[PRIORITIZE_TAG])
    assert written == []          # nothing was set...
    assert customer.tags == []    # ...but the flag is gone
    assert uow.customer_repository.saved == [customer]
    assert len(uow.session.added) == 1


def test_setting_a_key_beats_clearing_it_regardless_of_order():
    customer = _Customer()
    _apply(customer, tags=[PRIORITIZE_TAG], clear=[PRIORITIZE_TAG])
    assert customer.tags == [PRIORITIZE_TAG]


def test_prioritize_outcome_keeps_the_customer_interested():
    """prioritize_next_visit is in the interested family — the flag is extra,
    not a replacement, or a prioritized customer would vanish from interest."""
    tags = tags_for_outcome(TripStopOutcome.INTERESTED_PRIORITIZE_NEXT_VISIT.value)
    assert tags == [INTEREST_YES, PRIORITIZE_TAG]


# --- the key extraction ----------------------------------------------------

def test_machine_key_splits_on_the_first_separator_only():
    """The Arabic half is free text. Splitting on every ' - ' (or from the
    right) would take a bite out of it and lose the family."""
    assert outcome_machine_key("blacklist - القائمة السوداء - إضافي") == "blacklist"


@pytest.mark.parametrize("outcome", [None, "", "   "])
def test_unreadable_outcome_tags_nothing(outcome):
    """Legacy rows hold NULL and one stop in production holds ''. Neither is a
    verdict, and neither may raise inside a stop completion."""
    assert tags_for_outcome(outcome) == []


def test_unknown_outcome_family_tags_nothing():
    """A value from outside the enum (hand-edited, or from a future client)
    must be ignored rather than guessed at."""
    assert tags_for_outcome("something_else:reason - نص") == []


# --- 2. the derived values are real catalog tags ---------------------------

def _every_derivable_tag():
    produced = {SALE_NONE, SALE_ONE_TIME, SALE_REPEATED}
    for outcome in TripStopOutcome:
        produced.update(tags_for_outcome(outcome.value))
    return sorted(produced)


def test_derived_tags_are_all_in_the_predefined_catalog():
    """Otherwise the tag stores fine, shows raw in both clients, and silently
    counts as a custom tag in every analytics grouping."""
    catalog = {entry["tag"] for entry in PREDEFINED_CUSTOMER_TAGS}
    assert set(_every_derivable_tag()) <= catalog


@pytest.mark.parametrize("tag", _every_derivable_tag())
def test_derived_tags_survive_the_tag_validator(tag):
    """These are written straight onto the model, bypassing the DTO — so the
    validator is asserted here instead. One at a time: the full set contains
    both values of each derived key, which is exactly what the validator is
    supposed to reject (see the single-valued test below)."""
    assert normalize_tags([tag]) == [tag]


def test_the_two_derived_keys_are_single_valued():
    """Both sale states at once would be rejected by the validator on the next
    manual edit of that customer, stranding them."""
    with pytest.raises(ValueError):
        normalize_tags([SALE_ONE_TIME, SALE_REPEATED])


# --- 3. applying the tags --------------------------------------------------

def test_new_customer_starts_as_a_non_buyer():
    assert with_default_sale_tag([]) == [SALE_NONE]
    assert with_default_sale_tag(["vip"]) == ["vip", SALE_NONE]


def test_an_explicit_sale_state_at_create_is_respected():
    """A customer entered because they already buy is not a non-buyer."""
    assert with_default_sale_tag([SALE_REPEATED]) == [SALE_REPEATED]


def test_default_sale_tag_never_overflows_the_cap():
    full = [f"t{i}" for i in range(MAX_TAGS)]
    assert with_default_sale_tag(full) == full


# --- the sale ladder only climbs -------------------------------------------
#
# An order proves "has bought at least once", which is WEAKER than "buys
# repeatedly". This is the one derived key where the derivation can be less
# informed than what it would replace, so it is the one place automatic does
# not simply win.

def test_first_order_promotes_a_new_customer():
    assert sale_tag_for_order(_Customer(SALE_NONE), bought_before=False) == [SALE_ONE_TIME]


def test_a_later_order_promotes_to_repeated():
    assert sale_tag_for_order(_Customer(SALE_ONE_TIME), bought_before=True) == [SALE_REPEATED]


def test_a_first_in_system_order_does_not_demote_a_known_repeat_buyer():
    """A customer onboarded as an existing buyer keeps that standing. Demoting
    them would also make the funnel show one customer converting twice in
    opposite directions — down now, up again on their next order."""
    assert sale_tag_for_order(_Customer(SALE_REPEATED), bought_before=False) == []


def test_an_unchanged_rung_is_not_rewritten():
    assert sale_tag_for_order(_Customer(SALE_ONE_TIME), bought_before=False) == []
    assert sale_tag_for_order(_Customer(SALE_REPEATED), bought_before=True) == []


def test_an_untagged_customer_still_gets_a_sale_tag():
    assert sale_tag_for_order(_Customer("vip"), bought_before=False) == [SALE_ONE_TIME]


def test_an_unrecognised_sale_value_is_replaced():
    """A hand-typed customer_sale:whatever has no rung, so the derivation wins
    rather than being blocked forever by a value nothing understands."""
    assert sale_tag_for_order(_Customer("customer_sale:maybe"), bought_before=False) == [SALE_ONE_TIME]


# --- voiding an order re-evaluates the rung -------------------------------
#
# The one path that may move the sale key DOWN. A voided order has to stop
# counting, or a customer sits at repeated_sale on the tag dashboards while
# being absent from the revenue ones.

@pytest.mark.parametrize(
    "count,expected",
    [(0, SALE_NONE), (1, SALE_ONE_TIME), (2, SALE_REPEATED), (7, SALE_REPEATED)],
)
def test_the_rung_a_live_order_count_justifies(count, expected):
    assert sale_tag_for_live_order_count(count) == expected


def test_voiding_the_only_order_returns_the_customer_to_no_sale():
    customer = _Customer(SALE_ONE_TIME, INTEREST_YES)
    assert sale_tag_after_void(customer, live_orders=0) == [SALE_NONE]


def test_voiding_one_of_two_orders_drops_to_one_time():
    customer = _Customer(SALE_REPEATED)
    assert sale_tag_after_void(customer, live_orders=1) == [SALE_ONE_TIME]


def test_voiding_one_of_many_orders_changes_nothing():
    customer = _Customer(SALE_REPEATED)
    assert sale_tag_after_void(customer, live_orders=2) == []


def test_a_void_does_not_strip_a_standing_the_orders_never_granted():
    """A customer onboarded as a known repeat buyer, whose single in-system
    order is then voided, must not come out WORSE than before that order
    existed. One order could never have justified repeated_sale, so that value
    came from a person and the void leaves it alone."""
    customer = _Customer(SALE_REPEATED)
    assert sale_tag_after_void(customer, live_orders=0) == []


def test_a_void_still_corrects_a_standing_the_orders_did_grant():
    """The mirror case: two orders DID justify repeated_sale, so voiding one is
    entitled to walk it back."""
    customer = _Customer(SALE_REPEATED)
    assert sale_tag_after_void(customer, live_orders=1) == [SALE_ONE_TIME]


def test_a_void_that_changes_nothing_writes_nothing():
    customer = _Customer(SALE_ONE_TIME)
    assert sale_tag_after_void(customer, live_orders=1) == []


def test_a_customer_with_no_sale_tag_gains_one_on_a_void():
    """Legacy rows predate the derivation; a void is as good a moment as any to
    give them the baseline."""
    customer = _Customer("vip")
    assert sale_tag_after_void(customer, live_orders=0) == [SALE_NONE]


def test_a_void_leaves_interest_and_manual_tags_alone():
    """Voiding paperwork does not un-happen the interest the order showed, and
    the same key may have come from a trip stop instead."""
    customer = _Customer(SALE_ONE_TIME, INTEREST_YES, "agent", BLACKLIST_TAG)
    _apply(customer, tags=sale_tag_after_void(customer, live_orders=0))
    assert set(customer.tags) == {SALE_NONE, INTEREST_YES, "agent", BLACKLIST_TAG}


def test_the_full_void_round_trip_is_recorded():
    """no_sale -> one_time_sale on the order, and back again on the void, so the
    funnel analytics see the reversal rather than silently drifting."""
    customer = _Customer(SALE_NONE)
    _apply(customer, tags=sale_tag_for_order(customer, bought_before=False))
    assert customer.tags == [SALE_ONE_TIME]
    uow, _ = _apply(customer, tags=sale_tag_after_void(customer, live_orders=0))
    assert customer.tags == [SALE_NONE]
    assert ("customer_sale", "one_time_sale", "no_sale") in {
        (e.key, e.old_value, e.new_value) for e in uow.session.added
    }


def test_applying_replaces_the_previous_value_of_the_same_key():
    """One value per key: the first order moves the customer off no_sale rather
    than stacking a second sale state the validator would later reject."""
    customer = _Customer(SALE_NONE, "vip")
    _, written = _apply(customer, [SALE_ONE_TIME])
    assert customer.tags == ["vip", SALE_ONE_TIME]
    assert written == [SALE_ONE_TIME]


def test_applying_leaves_keys_nobody_derives_alone():
    """agent, skip_distribution and custom tags are the user's business."""
    customer = _Customer("agent", "skip_distribution", "region:malki")
    _apply(customer, [INTEREST_YES])
    assert set(customer.tags) == {"agent", "skip_distribution", "region:malki", INTEREST_YES}


def test_reapplying_the_same_value_writes_nothing():
    """A second order should not append a duplicate event to the customer's
    history, or the transition analytics count churn that never happened."""
    customer = _Customer(SALE_REPEATED, INTEREST_YES)
    uow, written = _apply(customer, [SALE_REPEATED, INTEREST_YES])
    assert written == []
    assert uow.session.added == []
    assert uow.customer_repository.saved == []


def test_a_changed_value_is_recorded_in_the_history():
    customer = _Customer(SALE_NONE)
    uow, _ = _apply(customer, [SALE_ONE_TIME, INTEREST_YES])
    changed = {(e.key, e.old_value, e.new_value) for e in uow.session.added}
    assert changed == {
        ("customer_sale", "no_sale", "one_time_sale"),
        ("customer_interest", None, "interested"),
    }


def test_history_is_attributed_to_the_customers_own_account():
    """Not the caller's scope: a stop can complete outside a request context,
    where the unit of work has no account of its own."""
    customer = _Customer()
    uow, _ = _apply(customer, [INTEREST_YES])
    assert {e.account_uuid for e in uow.session.added} == {"acct-1"}


def test_the_tag_list_is_reassigned_not_mutated_in_place():
    """customer.tags is a plain ARRAY column — no MutableList wrapper — so an
    in-place append is invisible to SQLAlchemy and the write is dropped at
    flush with no error. Identity is the only way to catch that here."""
    customer = _Customer(SALE_NONE)
    before = customer.tags
    _apply(customer, [SALE_ONE_TIME])
    assert customer.tags is not before


def test_a_full_customer_skips_the_tag_rather_than_failing_the_order():
    """The cap must never be able to reject a sale."""
    customer = _Customer(*[f"t{i}" for i in range(MAX_TAGS)])
    uow, written = _apply(customer, [INTEREST_YES])
    assert written == []
    assert len(customer.tags) == MAX_TAGS
    assert uow.session.added == []


def test_a_full_customer_can_still_have_a_derived_key_moved():
    """Replacing an existing key does not grow the list, so a customer at the
    cap still tracks their own sale funnel."""
    customer = _Customer(SALE_NONE, *[f"t{i}" for i in range(MAX_TAGS - 1)])
    _, written = _apply(customer, [SALE_ONE_TIME])
    assert written == [SALE_ONE_TIME]
    assert SALE_NONE not in customer.tags and SALE_ONE_TIME in customer.tags


def test_a_missing_customer_is_a_no_op():
    """A manual trip stop has no customer at all."""
    uow = _FakeUow()
    assert apply_auto_tags(uow, customer=None, tags=[INTEREST_YES]) == []


def test_a_manually_cased_duplicate_key_is_converged_not_doubled():
    """Both tag editors compare keys case-insensitively; the derivation agrees,
    so a hand-typed 'Blacklist' does not end up beside the derived one and
    split the blacklist count in two."""
    customer = _Customer("Blacklist")
    _apply(customer, [BLACKLIST_TAG])
    assert customer.tags == [BLACKLIST_TAG]
