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


# --- what a stop SPENDS -----------------------------------------------------
#
# prioritize_next_stop asks for the next visit to come sooner. That visit is the
# next completed stop, so a verdict there uses the flag up — otherwise it sticks
# to every customer who ever earned it and stops distinguishing anyone.

SPENT_BY_OUTCOME = {
    TripStopOutcome.SALE: [PRIORITIZE_TAG],
    TripStopOutcome.INTERESTED_HAVE_INVENTORY: [PRIORITIZE_TAG],
    TripStopOutcome.INTERESTED_NEEDS_BETTER_PRICE: [PRIORITIZE_TAG],
    TripStopOutcome.INTERESTED_INSUFFICIENT_FUNDS: [PRIORITIZE_TAG],
    # asking for priority again must not spend the flag it is re-raising
    TripStopOutcome.INTERESTED_PRIORITIZE_NEXT_VISIT: [],
    TripStopOutcome.NOT_INTERESTED_COMPETITOR: [PRIORITIZE_TAG],
    TripStopOutcome.NOT_INTERESTED_BAD_PRODUCT: [PRIORITIZE_TAG],
    TripStopOutcome.NOT_INTERSTED_PRICE_TOO_HIGH: [PRIORITIZE_TAG],
    TripStopOutcome.NOT_INTERESTED_OTHER: [PRIORITIZE_TAG],
    # the visit never happened, so the priority it was owed is still owed
    TripStopOutcome.SKIPPED_CUSTOMER_NOT_AVAILABLE: [],
    TripStopOutcome.SKIPPED_VEHICLE_BREAKDOWN: [],
    TripStopOutcome.SKIPPED_NO_PARKING: [],
    TripStopOutcome.SKIPPED_NO_TIME: [],
    TripStopOutcome.SKIPPED_OTHER: [],
    TripStopOutcome.BLACKLIST: [PRIORITIZE_TAG],
}


def test_every_outcome_has_a_decided_spend():
    assert set(SPENT_BY_OUTCOME) == set(TripStopOutcome), (
        "TripStopOutcome changed: decide whether the new option spends "
        "prioritize_next_stop and add it to SPENT_BY_OUTCOME"
    )


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
