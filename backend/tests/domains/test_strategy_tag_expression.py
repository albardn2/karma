"""The grouped tag expression: its bounds, its discriminator, and its dump.

`tag_expression` is the one recursive shape in the config, and the config is
re-validated when the route step runs — so a tree that validates here but not
there, or vice versa, surfaces as a dead trip rather than a form error. These
tests pin the three things that are easy to break silently:

  * the bounds arithmetic (a leaf adds NO depth level),
  * the SHAPE-based discriminator, which must tag a node with no `kind` key
    because every leaf already stored in routing_strategy.config has none,
  * the dump, which goes straight into the JSONB column.
"""
import pytest
from pydantic import ValidationError

from app.dto.routing_strategy import (
    MAX_TAG_CHILDREN,
    MAX_TAG_DEPTH,
    MAX_TAG_LEAVES,
    RoutingStrategyConfig,
    TagConnector,
    TagFilter,
    TagGroup,
)


def _cfg(**prio):
    return {"priorities": [prio]}


def _row(value, op="EQUAL"):
    return {"op": op, "value": value}


def _group(op, *children):
    return {"op": op, "children": list(children)}


# --------------------------------------------------------------------------
# the shape itself


def test_the_users_own_example_validates():
    """((X OR Y) AND NOT Z AND NOT W) — the rule that motivated grouping."""
    cfg = RoutingStrategyConfig(**_cfg(tag_expression=_group(
        "AND",
        _group("OR", _row("customer_sale:one_time_sale"), _row("customer_sale:repeat_sale")),
        _row("blacklist", op="NOT_EQUAL"),
        _row("skip_distribution", op="NOT_EQUAL"),
    )))
    root = cfg.priorities[0].tag_expression
    assert root.op is TagConnector.AND
    assert len(root.children) == 3
    assert isinstance(root.children[0], TagGroup)
    assert isinstance(root.children[1], TagFilter)


def test_a_leaf_needs_no_kind_key():
    """Stored leaves have no `kind`, so the discriminator must not require it."""
    root = RoutingStrategyConfig(**_cfg(tag_expression=_group("OR", _row("a"), _row("b")))) \
        .priorities[0].tag_expression
    assert all(isinstance(c, TagFilter) for c in root.children)


def test_a_group_may_declare_its_kind_explicitly():
    """The builder sends `kind`; a hand-written client may not. Both parse."""
    with_kind = _group("AND", _row("a"))
    with_kind["kind"] = "group"
    cfg = RoutingStrategyConfig(**_cfg(tag_expression=with_kind))
    assert isinstance(cfg.priorities[0].tag_expression.children[0], TagFilter)


def test_an_empty_group_is_refused():
    """AND over nothing would silently mean 'match everyone'."""
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_expression=_group("AND")))


def test_both_shapes_on_one_priority_is_refused():
    with pytest.raises(ValidationError) as e:
        RoutingStrategyConfig(**_cfg(
            tag_filters=[_row("vip")],
            tag_expression=_group("AND", _row("vip")),
        ))
    assert "not both" in str(e.value)


# --------------------------------------------------------------------------
# bounds — a leaf adds NO level, so the user's own 3-level example must pass


def _nested(levels):
    """`levels` groups wrapped around one leaf. The leaf adds NO level."""
    node = _row("z")
    for _ in range(levels):
        node = _group("OR", node)
    return node


def test_the_deepest_allowed_nesting_validates():
    RoutingStrategyConfig(**_cfg(tag_expression=_nested(MAX_TAG_DEPTH)))


def test_one_level_too_deep_is_refused():
    with pytest.raises(ValidationError) as e:
        RoutingStrategyConfig(**_cfg(tag_expression=_nested(MAX_TAG_DEPTH + 1)))
    assert "nest" in str(e.value)


def test_the_leaf_budget_is_exact():
    full = _group("AND", *[
        _group("OR", _row(f"a{i}"), _row(f"b{i}")) for i in range(MAX_TAG_LEAVES // 2)
    ])
    RoutingStrategyConfig(**_cfg(tag_expression=full))

    over = _group("AND", *[
        _group("OR", _row(f"a{i}"), _row(f"b{i}")) for i in range(MAX_TAG_LEAVES // 2)
    ])
    over["children"].append(_row("one-too-many"))
    with pytest.raises(ValidationError) as e:
        RoutingStrategyConfig(**_cfg(tag_expression=over))
    assert str(MAX_TAG_LEAVES) in str(e.value)


def test_a_group_wider_than_the_cap_is_refused():
    wide = _group("AND", *[_row(f"t{i}") for i in range(MAX_TAG_CHILDREN + 1)])
    with pytest.raises(ValidationError):
        RoutingStrategyConfig(**_cfg(tag_expression=wide))


def test_the_legacy_flat_list_is_NOT_bounded_by_the_group_caps():
    """`tag_filters` predates the caps and stored configs may exceed them.

    This is why the builder checks the group bounds against the shape it is
    about to SEND: a stored priority may legitimately hold more rows than a
    group may, and it stays saveable until someone regroups it.
    """
    cfg = RoutingStrategyConfig(**_cfg(
        tag_filters=[_row(f"t{i}") for i in range(MAX_TAG_CHILDREN + 4)],
    ))
    assert len(cfg.priorities[0].tag_filters) == MAX_TAG_CHILDREN + 4


# --------------------------------------------------------------------------
# the dump, which is persisted verbatim


def test_a_legacy_config_round_trips_byte_identically():
    """Re-saving an untouched legacy strategy must not rewrite its config.

    If the dump stamped `tag_expression: null` onto every priority, renaming
    any strategy would rewrite every row — and the PRE-grouping DTO is
    extra="forbid", so a rollback would then refuse rows it wrote itself.
    """
    stored = {"priorities": [{
        "tag_filters": [{"op": "EQUAL", "value": "vip"}],
        "category_filter": None,
        "debt_filter": None,
        "last_effective_stop_days": None,
        "max_stops": 3,
    }]}
    assert RoutingStrategyConfig(**stored).model_dump(mode="json") == stored


def test_a_grouped_config_round_trips_through_its_own_dump():
    cfg = RoutingStrategyConfig(**_cfg(tag_expression=_group(
        "AND",
        _group("OR", _row("a"), _row("b")),
        _row("c", op="NOT_EQUAL"),
    )))
    dumped = cfg.model_dump(mode="json")
    assert RoutingStrategyConfig(**dumped).model_dump(mode="json") == dumped


# --------------------------------------------------------------------------
# evaluation: the new path must be a strict no-op for every legacy config


def test_a_legacy_priority_evaluates_identically_through_the_tree():
    """`tag_filters` lowers into an implicit AND root — same answer, always.

    Every strategy in production today is the legacy shape, so a single
    disagreement here is a silently different distribution.
    """
    from itertools import combinations

    from app.domains.trip.priority_router import (
        tag_expression_matches,
        tag_expression_of,
        tag_filter_matches,
    )
    from app.dto.routing_strategy import StrategyPriority, TagFilterOp

    filters = [
        {"op": "EQUAL", "value": "vip"},
        {"op": "NOT_EQUAL", "value": "blacklist"},
        {"op": "CONTAINS", "value": "sale"},
        {"op": "IS_IN", "value": ["agent", "wholesale"]},
    ]
    universe = ["vip", "blacklist", "customer_sale:repeat_sale", "agent", "unrelated"]
    pools = [list(c) for n in range(len(universe) + 1) for c in combinations(universe, n)]

    for n in range(1, len(filters) + 1):
        priority = StrategyPriority(tag_filters=filters[:n])
        node = tag_expression_of(priority)
        for tags in pools:
            legacy = all(
                tag_filter_matches(tags, TagFilterOp(f.op), f.value)
                for f in priority.tag_filters
            )
            assert tag_expression_matches(tags, node) is legacy, (n, tags)


def test_no_tag_constraint_matches_everyone():
    from app.domains.trip.priority_router import tag_expression_matches, tag_expression_of
    from app.dto.routing_strategy import StrategyPriority

    node = tag_expression_of(StrategyPriority())
    assert node is None
    assert tag_expression_matches([], node) is True
    assert tag_expression_matches(["anything"], node) is True


def test_an_or_of_two_equals_matches_either():
    from app.domains.trip.priority_router import tag_expression_matches
    from app.dto.routing_strategy import StrategyPriority

    priority = StrategyPriority(**{"tag_expression": _group(
        "AND",
        _group("OR", _row("customer_sale:one_time_sale"), _row("customer_sale:repeat_sale")),
        _row("blacklist", op="NOT_EQUAL"),
    )})
    node = priority.tag_expression
    assert tag_expression_matches(["customer_sale:one_time_sale"], node) is True
    assert tag_expression_matches(["customer_sale:repeat_sale"], node) is True
    assert tag_expression_matches(["customer_sale:repeat_sale", "blacklist"], node) is False
    assert tag_expression_matches(["something_else"], node) is False
    # the NOT_EQUAL alone is not enough — the OR branch still has to hold
    assert tag_expression_matches([], node) is False
