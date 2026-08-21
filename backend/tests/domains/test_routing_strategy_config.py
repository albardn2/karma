"""The strategy config contract: what the builder saves and the router trusts.

The config is stored as JSONB and re-validated when the route step runs, so
this schema is the single line of defense between the builder UI and the
routing engine — shapes that would misroute must fail here.
"""
import pytest
from pydantic import ValidationError

from app.dto.routing_strategy import (
    RoutingStrategyConfig,
    RoutingStrategyCreate,
    StrategyPriority,
)


def _cfg(**prio):
    return {"priorities": [prio]}


def test_a_full_priority_validates():
    cfg = RoutingStrategyConfig(**_cfg(
        tag_filters=[
            {"op": "EQUAL", "value": "customer_sale:repeated_sale"},
            {"op": "IS_IN", "value": ["vip", "agent"]},
            {"op": "CONTAINS", "value": "interest"},
        ],
        category_filter={"op": "IS_IN", "value": ["minimarket", "supermarket"]},
        debt_filter={"op": "LARGER_THAN", "amount": 0, "currency": "SYP"},
        last_effective_stop_days=14,
        max_stops=10,
    ))
    prio = cfg.priorities[0]
    assert prio.tag_filters[1].value == ["vip", "agent"]
    assert prio.debt_filter.currency.value == "SYP"


def test_an_empty_priority_is_allowed_as_a_catch_all():
    cfg = RoutingStrategyConfig(**_cfg())
    assert cfg.priorities[0] == StrategyPriority()


def test_is_in_requires_values_and_tolerates_a_comma_string():
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "IS_IN", "value": []}]))
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "IS_IN", "value": ["  "]}]))
    # a plain text input submits "a, b" — commas are forbidden inside tags,
    # so splitting is safe
    cfg = RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "IS_IN", "value": "vip, agent"}]))
    assert cfg.priorities[0].tag_filters[0].value == ["vip", "agent"]


def test_single_value_ops_refuse_lists_and_blanks():
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "EQUAL", "value": ["a", "b"]}]))
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "CONTAINS", "value": "   "}]))
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(category_filter={"op": "EQUAL", "value": ""}))


def test_unknown_ops_are_refused():
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "REGEX", "value": "x"}]))
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(category_filter={"op": "CONTAINS", "value": "x"}))
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(debt_filter={"op": "EQUAL", "amount": 1}))


def test_priorities_bounds():
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(priorities=[])
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(priorities=[{} for _ in range(11)])


def test_stored_shape_revalidates():
    """The route step re-validates the stored JSONB; a hand-edited row with a
    stray key must fail loudly, not route garbage."""
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(priorities=[{"max_stopz": 5}])


def test_names_reserved_and_bounded():
    ok = RoutingStrategyCreate(name="  vip first  ", config=_cfg())
    assert ok.name == "vip first"
    for bad in ("manual", "MANUAL", "legacy_cluster", "", "   ", "a" * 65,
                "a,b", "أ،ب", "__create_strategy__", "_hidden"):
        with pytest.raises(ValidationError):
            RoutingStrategyCreate(name=bad, config=_cfg())


def test_tag_values_converge_catalog_label_spellings():
    """AR-mode dispatchers retype the visible chip text; customer tags are
    canonicalized on write (normalize_tags), so the filter values must
    converge the same spellings or they can never match any stored tag."""
    cfg = RoutingStrategyConfig(**_cfg(tag_filters=[
        {"op": "EQUAL", "value": "اهتمام العميل: مهتم"},
        {"op": "IS_IN", "value": ["customer_sale: no_sale", "القائمة السوداء"]},
        {"op": "CONTAINS", "value": "بيع العميل: بيع متكرر"},
        {"op": "EQUAL", "value": "my custom tag"},  # non-catalog stays as typed
    ]))
    filters = cfg.priorities[0].tag_filters
    assert filters[0].value == "customer_interest:interested"
    assert filters[1].value == ["customer_sale:no_sale", "blacklist"]
    assert filters[2].value == "customer_sale:repeated_sale"
    assert filters[3].value == "my custom tag"


def test_is_in_splits_the_arabic_comma_too():
    """The AR keyboard produces U+060C; following the Arabic placeholder must
    not silently produce one merged un-matchable value. Splitting on it is
    safe because normalize_tags forbids BOTH commas inside customer tags."""
    cfg = RoutingStrategyConfig(**_cfg(tag_filters=[{"op": "IS_IN", "value": "vip، agent"}]))
    assert cfg.priorities[0].tag_filters[0].value == ["vip", "agent"]


def test_customer_tags_refuse_both_commas():
    """The invariant the IS_IN split relies on lives in normalize_tags."""
    import pytest as _pytest

    from app.dto.customer import normalize_tags

    with _pytest.raises(ValueError):
        normalize_tags(["a,b"])
    with _pytest.raises(ValueError):
        normalize_tags(["منطقة، خاصة"])
