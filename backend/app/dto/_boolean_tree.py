"""Shared machinery for the AND/OR filter trees.

Two builders now hold one: the customer map's query toolbar (dto/customer_query)
and a routing strategy's tag filters (dto/routing_strategy). The node shape, the
discriminator and the bounds arithmetic are identical in both, and a mistake in
any of them would be identical and invisible in both — so they live here once.

Nothing in this module imports either DTO. It is duck-typed on `children`, which
also fixes the import direction: customer_query already imports _clean_values
and canonical_tag_value FROM routing_strategy, so routing_strategy must never
import customer_query. A lower-level module is the only cycle-free arrangement.
"""
from typing import Iterator


def node_tag(v):
    """Discriminate a tree node: anything carrying `children` is a group.

    A CALLABLE discriminator, deliberately, rather than
    Field(discriminator="kind"). With a Literal discriminator pydantic REQUIRES
    `kind` in the input even though it defaults, which would 422 every
    hand-written client — and, for the routing strategy, every leaf already
    stored in routing_strategy.config, which has no `kind` key.

    The instance branch falls back to the presence of `children` rather than
    trusting a declared `kind`: a leaf model is allowed NOT to declare one (a
    persisted leaf should not grow a new key), so `getattr(v, "kind", None)`
    alone would return None and fail to discriminate a model instance.
    """
    if isinstance(v, dict):
        return v.get("kind") or ("group" if "children" in v else "row")
    declared = getattr(v, "kind", None)
    if declared:
        return declared
    return "group" if hasattr(v, "children") else "row"


def iter_leaves(node) -> Iterator:
    """Every leaf in the tree, in order."""
    children = getattr(node, "children", None)
    if children is None:
        yield node
        return
    for child in children:
        yield from iter_leaves(child)


def measure(node, depth: int = 1):
    """(deepest GROUP level, leaf count, node count) for one subtree.

    A leaf adds NO level — it lives at its parent group's depth. Counting
    leaves as a level would make a root's own conditions look one deeper than
    they are and refuse a tree the UI is allowed to build.
    """
    children = getattr(node, "children", None)
    if children is None:
        return depth - 1, 1, 1
    deepest, leaves, nodes = depth, 0, 1
    for child in children:
        d, l, n = measure(child, depth + 1)
        deepest = max(deepest, d)
        leaves += l
        nodes += n
    return deepest, leaves, nodes
