/**
 * The arithmetic behind the AND/OR group builders, independent of what a leaf is.
 *
 * Two builders now hold one — the customer map's query toolbar and a routing
 * strategy's tag filters. Only the arithmetic is shared, not the JSX: the two
 * leaves are genuinely different (a query row is field + op + a four-way value
 * control; a tag leaf is op + one input), and a generic renderer would need a
 * leaf renderer, a blank-leaf factory, six i18n keys, a testid prefix and three
 * bounds passed in — more caller code than the markup it would save.
 *
 * `updateAt` in particular must exist exactly once. Its path arithmetic and
 * cascade-delete are the subtlest part of either builder, and a bug there would
 * be identical and invisible in both.
 *
 * These are generic over the caller's own NODE union rather than over a leaf
 * payload, so each builder keeps its own hand-written types and needs no
 * wrapper. The cost is one internal cast per function to reach `children`,
 * which TypeScript cannot narrow through an unconstrained generic; the
 * contract each caller must honour is: a node whose `kind` is "group" has a
 * `children` array of the same node type.
 */

/** The minimum every tree node carries. */
export interface TreeNodeLike {
  kind: "row" | "group";
  id: string;
}

type WithChildren<N> = { kind: string; children?: N[] };

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n${Math.random().toString(36).slice(2)}`;

/** Child indexes from the root, joined — the basis of every data-testid. */
export const pathKey = (path: number[]): string => path.join(".");

const childrenOf = <N,>(node: N): N[] | undefined => (node as WithChildren<N>).children;

/**
 * Replace the node at `path` via `fn`; returning null from `fn` deletes it.
 *
 * A group that loses its last child goes with it, cascading upward, so a state
 * where `children` is [] is unreachable — which both backends refuse, and which
 * under AND would silently mean "match everyone". A caller that WANTS an empty
 * root (a routing priority with no tag filters is a legitimate catch-all) must
 * reinstate it itself when this returns null for the root.
 */
export function updateAt<N extends TreeNodeLike>(
  node: N,
  path: number[],
  fn: (n: N) => N | null,
): N | null {
  if (path.length === 0) return fn(node);
  const children = childrenOf(node);
  if (node.kind !== "group" || !children) return node;
  const [head, ...rest] = path;
  const next: N[] = [];
  children.forEach((child, i) => {
    if (i !== head) {
      next.push(child);
      return;
    }
    const replaced = updateAt(child, rest, fn);
    if (replaced !== null) next.push(replaced);
  });
  if (next.length === 0) return null;
  return { ...node, children: next };
}

export function countLeaves<N extends TreeNodeLike>(node: N): number {
  const children = childrenOf(node);
  if (node.kind !== "group" || !children) return 1;
  return children.reduce((sum, c) => sum + countLeaves(c), 0);
}

/** True when every leaf satisfies `ok`. Says nothing about empty groups. */
export function everyLeaf<N extends TreeNodeLike>(node: N, ok: (leaf: N) => boolean): boolean {
  const children = childrenOf(node);
  if (node.kind !== "group" || !children) return ok(node);
  return children.every((c) => everyLeaf(c, ok));
}

/**
 * Most children held by any one group — the companion to `measureDepth`.
 *
 * Both exist for the same reason: a builder's `disabled=` gates a tree being
 * BUILT, and says nothing about one ARRIVING. A strategy loads stored trees,
 * including ones written before the bound existed, so it has to measure what
 * it was handed before it offers to send it back.
 */
export function widestGroup<N extends TreeNodeLike>(node: N): number {
  const children = childrenOf(node);
  if (node.kind !== "group" || !children) return 0;
  return children.reduce(
    (widest, c) => Math.max(widest, widestGroup(c)),
    children.length,
  );
}

/**
 * Deepest GROUP level in the tree, matching the backend's convention exactly:
 * a leaf adds NO level.
 */
export function measureDepth<N extends TreeNodeLike>(node: N, depth = 1): number {
  const children = childrenOf(node);
  if (node.kind !== "group" || !children) return depth - 1;
  return children.reduce(
    (deepest, c) => Math.max(deepest, measureDepth(c, depth + 1)),
    depth,
  );
}
