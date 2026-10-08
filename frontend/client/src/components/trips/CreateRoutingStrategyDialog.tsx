import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTagCatalog } from "@/lib/tagCatalog";
import {
  countLeaves,
  everyLeaf,
  measureDepth,
  newId,
  pathKey,
  updateAt,
  widestGroup,
} from "@/lib/filterTree";

// Builder for a saved priority-routing strategy (the setup form's dropdown
// offers it next to the built-in "manual"). A strategy is an ORDERED list of
// priorities; the router walks them until the trip's desired_stops is filled.
// Shape mirrors backend/app/dto/routing_strategy.py exactly.

const TAG_OPS = ["EQUAL", "NOT_EQUAL", "IS_IN", "CONTAINS"] as const;
const CATEGORY_OPS = ["EQUAL", "NOT_EQUAL", "IS_IN"] as const;
const DEBT_OPS = ["LARGER_THAN", "SMALLER_THAN"] as const;
const CURRENCIES = ["SYP", "USD"] as const;
// Radix Select can't hold an empty-string item value; sentinel for "off"
const NONE = "__none__";
// Every priority starts with a recency floor rather than none. The legacy
// routing pipeline always excluded customers with a recent completed stop; the
// strategy engine made recency a per-priority filter, and a BLANK field means
// "revisit anyone", which is a surprising default to land on silently. Prefilled
// so skipping recent visits is opt-OUT: clear the box to route regardless.
const DEFAULT_RECENCY_DAYS = "7";

interface TagLeafFields {
  op: (typeof TAG_OPS)[number];
  value: string; // IS_IN: comma-separated (the backend splits; commas can't occur inside tags)
}
type TagLeafDraft = TagLeafFields & { kind: "row"; id: string };
type TagGroupDraft = {
  kind: "group";
  id: string;
  op: "AND" | "OR";
  children: TagNodeDraft[];
};
type TagNodeDraft = TagLeafDraft | TagGroupDraft;

// Mirror dto/routing_strategy's MAX_TAG_* exactly. #155's review found that
// rewrite had dropped a bound the flat UI enforced, and the 422 that produced
// named no group — so every DTO bound is mirrored here from the start.
const MAX_TAG_DEPTH = 3;
const MAX_TAG_LEAVES = 10;
const MAX_TAG_CHILDREN = 8;

/** True when the tree is exactly the legacy shape: one AND of plain rows.
 *  Such a tree saves as `tag_filters`, which the DTO does NOT bound — which is
 *  why the group bounds below apply only once this stops being true. */
const isFlatAnd = (root: TagGroupDraft) =>
  root.op === "AND" && root.children.every((c) => c.kind === "row");

const blankTagLeaf = (): TagLeafDraft => ({
  kind: "row",
  id: newId(),
  op: "EQUAL",
  value: "",
});
const blankTagGroup = (op: "AND" | "OR"): TagGroupDraft => ({
  kind: "group",
  id: newId(),
  op,
  children: [blankTagLeaf()],
});
/** The root starts EMPTY, unlike the query builder's. A priority with no tag
 *  filters is a documented catch-all band and the state of most stored
 *  strategies — seeding a blank row would make every new priority invalid. */
const emptyTagRoot = (): TagGroupDraft => ({
  kind: "group",
  id: newId(),
  op: "AND",
  children: [],
});

interface PriorityDraft {
  tagRoot: TagGroupDraft;
  categoryOp: string; // NONE = no category filter
  categoryValue: string; // EQUAL / NOT_EQUAL
  categoryValues: string[]; // IS_IN
  debtOp: string; // NONE = no debt filter
  debtAmount: string;
  debtCurrency: (typeof CURRENCIES)[number];
  lastEffectiveDays: string; // '' = off
  maxStops: string; // '' = no per-priority cap
}

const tagNodeToPayload = (n: TagNodeDraft): any =>
  n.kind === "group"
    ? { kind: "group", op: n.op, children: n.children.map(tagNodeToPayload) }
    : { op: n.op, value: n.value.trim() };

const emptyPriority = (): PriorityDraft => ({
  tagRoot: emptyTagRoot(),
  categoryOp: NONE,
  categoryValue: "",
  categoryValues: [],
  debtOp: NONE,
  debtAmount: "",
  debtCurrency: "SYP",
  lastEffectiveDays: DEFAULT_RECENCY_DAYS,
  maxStops: "",
});

export interface EditableStrategy {
  uuid: string;
  name: string;
  config: any;
}

const tagLeafFromStored = (f: any): TagLeafDraft => ({
  kind: "row",
  id: newId(),
  op: f?.op ?? "EQUAL",
  // IS_IN round-trips through the comma-joined text input
  value: Array.isArray(f?.value) ? f.value.join(", ") : String(f?.value ?? ""),
});

const tagNodeFromStored = (n: any): TagNodeDraft =>
  Array.isArray(n?.children)
    ? {
        kind: "group",
        id: newId(),
        op: n?.op === "OR" ? "OR" : "AND",
        children: n.children.map(tagNodeFromStored),
      }
    : tagLeafFromStored(n);

/** A stored priority's tag constraint, in whichever shape it was saved.
 *  A legacy flat list is an n-way AND, so it loads as one implicit AND root —
 *  lossless, and it keeps the builder to a single code path. */
const tagRootFromConfig = (p: any): TagGroupDraft => {
  if (p?.tag_expression) {
    const node = tagNodeFromStored(p.tag_expression);
    if (node.kind === "group") return node;
    return { kind: "group", id: newId(), op: "AND", children: [node] };
  }
  const filters = Array.isArray(p?.tag_filters) ? p.tag_filters : [];
  return {
    kind: "group",
    id: newId(),
    op: "AND",
    children: filters.map(tagLeafFromStored),
  };
};

/** A stored config back into builder fields — the inverse of buildConfig.
 *  Editing must show exactly what is saved, so an absent recency value stays
 *  BLANK here rather than picking up DEFAULT_RECENCY_DAYS. */
const configToDrafts = (config: any): PriorityDraft[] => {
  const priorities = Array.isArray(config?.priorities) ? config.priorities : [];
  if (!priorities.length) return [emptyPriority()];
  return priorities.map((p: any) => ({
    tagRoot: tagRootFromConfig(p),
    categoryOp: p?.category_filter?.op ?? NONE,
    categoryValue: Array.isArray(p?.category_filter?.value)
      ? ""
      : String(p?.category_filter?.value ?? ""),
    categoryValues: Array.isArray(p?.category_filter?.value) ? p.category_filter.value : [],
    debtOp: p?.debt_filter?.op ?? NONE,
    debtAmount: p?.debt_filter?.amount === undefined || p?.debt_filter?.amount === null
      ? ""
      : String(p.debt_filter.amount),
    debtCurrency: (p?.debt_filter?.currency ?? "SYP") as PriorityDraft["debtCurrency"],
    lastEffectiveDays: p?.last_effective_stop_days === undefined || p?.last_effective_stop_days === null
      ? ""
      : String(p.last_effective_stop_days),
    maxStops: p?.max_stops === undefined || p?.max_stops === null ? "" : String(p.max_stops),
  }));
};

interface CreateRoutingStrategyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // present = edit that strategy; absent = create a new one
  editing?: EditableStrategy | null;
  // (canonical saved name, the name it had before this save or null when it
  // was just created) — the caller needs the previous name to decide whether
  // the trip's selection should follow a rename
  onSaved: (name: string, previousName: string | null) => void;
}

export function CreateRoutingStrategyDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: CreateRoutingStrategyDialogProps) {
  const { t, te } = useLanguage();
  const { toast } = useToast();
  const { catalog, labelFor } = useTagCatalog();

  const [name, setName] = useState("");
  const [priorities, setPriorities] = useState<PriorityDraft[]>([emptyPriority()]);

  // Seed on every OPEN, not just on mount: the same dialog instance serves
  // create and edit, so a stale draft from the last time it was open must not
  // leak into the next one.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPriorities(editing ? configToDrafts(editing.config) : [emptyPriority()]);
  }, [open, editing?.uuid]);

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/customer/categories"],
    enabled: open,
  });

  const patchPriority = (index: number, patch: Partial<PriorityDraft>) => {
    setPriorities((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  /** Mutate one node of a priority's tag tree, addressed by child-index path. */
  const mutateTag = (
    pi: number,
    path: number[],
    fn: (n: TagNodeDraft) => TagNodeDraft | null,
  ) => {
    const current = priorities[pi].tagRoot;
    const next = updateAt<TagNodeDraft>(current, path, fn);
    // Unlike the query builder, an EMPTY root is legitimate here — a priority
    // with no tag filters is a catch-all band. So restore an empty root rather
    // than one seeded with a blank row, and keep its deliberate ALL/ANY.
    patchPriority(pi, {
      tagRoot:
        next && next.kind === "group"
          ? next
          : { ...emptyTagRoot(), op: current.op },
    });
  };

  const renderTagLeaf = (pi: number, leaf: TagLeafDraft, path: number[]) => {
    const key = `${pi}-${pathKey(path)}`;
    return (
      <div className="flex gap-2 items-center">
        <Select
          value={leaf.op}
          onValueChange={(op) =>
            mutateTag(pi, path, (n) => ({ ...(n as TagLeafDraft), op: op as TagLeafFields["op"] }))
          }
        >
          <SelectTrigger className="w-40" data-testid={`tag-op-${key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAG_OPS.map((op) => (
              <SelectItem key={op} value={op}>
                {t(`workflows.op${op}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="flex-1"
          list="strategy-tag-suggestions"
          value={leaf.value}
          placeholder={
            leaf.op === "IS_IN"
              ? t("workflows.strategyTagListPlaceholder")
              : t("workflows.strategyTagPlaceholder")
          }
          onChange={(e) =>
            mutateTag(pi, path, (n) => ({ ...(n as TagLeafDraft), value: e.target.value }))
          }
          data-testid={`tag-value-${key}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => mutateTag(pi, path, () => null)}
          data-testid={`tag-remove-${key}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const renderTagGroup = (
    pi: number,
    group: TagGroupDraft,
    path: number[],
    depth: number,
  ) => {
    const key = `${pi}-${pathKey(path)}`;
    const isRoot = path.length === 0;
    const leaves = countLeaves(priorities[pi].tagRoot);
    const budgetFull = leaves >= MAX_TAG_LEAVES;
    const groupFull = group.children.length >= MAX_TAG_CHILDREN;
    const canNest = depth < MAX_TAG_DEPTH;
    // Only reachable for a tree that ARRIVED: `tag_filters` is unbounded in
    // the DTO and the flat builder never capped it, so a priority stored
    // before grouping existed may hold more rows than a GROUP may. It saves
    // fine as-is; it cannot be regrouped until it is trimmed.
    const overCap = group.children.length > MAX_TAG_CHILDREN;
    // An OR holding a NOT_EQUAL is almost never meant: "not blacklisted OR not
    // skipped" is true for anyone missing either tag, and an untagged customer
    // satisfies every NOT_EQUAL on its own. Over-ANDing shows up as an empty
    // route; this over-matches silently, and the builder has no match count.
    const orWithNegation =
      group.op === "OR" &&
      group.children.some((c) => c.kind === "row" && c.op === "NOT_EQUAL");

    return (
      <div
        className={
          isRoot
            ? "space-y-2"
            : "space-y-2 rounded-md border-s-2 border-[#5469D4]/40 bg-gray-50/60 dark:bg-gray-800/40 ps-2 sm:ps-3 py-2"
        }
        data-testid={isRoot ? `tag-group-${pi}` : `tag-group-${key}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {isRoot && <Label className="me-1">{t("workflows.strategyTagFilters")}</Label>}
          <div className="flex items-center gap-1" data-testid={`tag-group-op-${key}`}>
            <Button
              type="button"
              variant={group.op === "AND" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => mutateTag(pi, path, (n) => ({ ...(n as TagGroupDraft), op: "AND" }))}
            >
              {t("workflows.strategyTagAll")}
            </Button>
            <Button
              type="button"
              variant={group.op === "OR" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => mutateTag(pi, path, (n) => ({ ...(n as TagGroupDraft), op: "OR" }))}
            >
              {t("workflows.strategyTagAny")}
            </Button>
          </div>
          {!isRoot && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => mutateTag(pi, path, () => null)}
              data-testid={`tag-group-remove-${key}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {overCap && (
          <p className="text-xs text-amber-700 dark:text-amber-500" data-testid={`tag-over-cap-${key}`}>
            {t("workflows.strategyTagGroupOverCap", {
              n: String(group.children.length),
              max: String(MAX_TAG_CHILDREN),
            })}
          </p>
        )}

        {orWithNegation && (
          <p className="text-xs text-amber-700 dark:text-amber-500" data-testid={`tag-or-not-warning-${key}`}>
            {t("workflows.strategyTagOrNotWarning")}
          </p>
        )}

        {group.children.length === 0 && (
          <p className="text-xs text-gray-500">{t("workflows.strategyTagNone")}</p>
        )}

        {group.children.map((child, i) => {
          const childPath = [...path, i];
          return (
            <div key={child.id} className="space-y-2">
              {i > 0 && (
                <p aria-hidden className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {group.op === "AND" ? t("common.and") : t("common.or")}
                </p>
              )}
              {child.kind === "row"
                ? renderTagLeaf(pi, child, childPath)
                : renderTagGroup(pi, child, childPath, depth + 1)}
            </div>
          );
        })}

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={budgetFull || groupFull}
            onClick={() =>
              mutateTag(pi, path, (n) => ({
                ...(n as TagGroupDraft),
                children: [...(n as TagGroupDraft).children, blankTagLeaf()],
              }))
            }
            data-testid={isRoot ? `add-tag-filter-${pi}` : `add-tag-filter-${key}`}
          >
            <Plus className="h-4 w-4 me-1" />
            {t("workflows.strategyAddTagFilter")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={budgetFull || groupFull || !canNest}
            onClick={() =>
              mutateTag(pi, path, (n) => {
                const g = n as TagGroupDraft;
                // the opposite op by default: a same-op nested group is a no-op
                return { ...g, children: [...g.children, blankTagGroup(g.op === "AND" ? "OR" : "AND")] };
              })
            }
            data-testid={isRoot ? `add-tag-group-${pi}` : `add-tag-group-${key}`}
          >
            <Plus className="h-4 w-4 me-1" />
            {t("workflows.strategyAddTagGroup")}
          </Button>
          {isRoot && leaves > 0 && (
            <span className="text-xs text-gray-500" data-testid={`tag-budget-${pi}`}>
              {t("workflows.strategyTagBudget", { used: String(leaves), max: String(MAX_TAG_LEAVES) })}
            </span>
          )}
          {/* Why the add buttons are greyed out, as TEXT. It was a `title` on
              the buttons themselves until the review pointed out that the
              shared Button is `disabled:pointer-events-none`, so the browser
              never fires the hover and the tooltip could not render at all.
              The budget counter already explains `budgetFull`. */}
          {!budgetFull && (groupFull || !canNest) && (
            <span className="text-xs text-gray-500" data-testid={`tag-bound-hint-${key}`}>
              {groupFull
                ? t("workflows.strategyTagMaxChildren", { max: String(MAX_TAG_CHILDREN) })
                : t("workflows.strategyTagMaxDepth", { max: String(MAX_TAG_DEPTH - 1) })}
            </span>
          )}
        </div>
      </div>
    );
  };

  const buildConfig = () => ({
    priorities: priorities.map((p) => {
      const priority: Record<string, unknown> = {};
      // The narrowest shape that expresses the tree. A flat AND of leaves goes
      // back as `tag_filters`, so opening any existing strategy and re-saving
      // it produces a byte-identical config and the legacy path keeps a live
      // producer. Only a genuine OR or nesting writes `tag_expression`.
      const leaves = countLeaves(p.tagRoot);
      if (leaves > 0) {
        if (isFlatAnd(p.tagRoot)) {
          priority.tag_filters = (p.tagRoot.children as TagLeafDraft[]).map((f) => ({
            op: f.op,
            value: f.value.trim(),
          }));
        } else {
          priority.tag_expression = tagNodeToPayload(p.tagRoot);
        }
      }
      if (p.categoryOp !== NONE) {
        priority.category_filter = {
          op: p.categoryOp,
          value: p.categoryOp === "IS_IN" ? p.categoryValues : p.categoryValue,
        };
      }
      if (p.debtOp !== NONE) {
        priority.debt_filter = {
          op: p.debtOp,
          amount: Number(p.debtAmount),
          currency: p.debtCurrency,
        };
      }
      if (p.lastEffectiveDays.trim() !== "") {
        priority.last_effective_stop_days = Number(p.lastEffectiveDays);
      }
      if (p.maxStops.trim() !== "") {
        priority.max_stops = Number(p.maxStops);
      }
      return priority;
    }),
  });

  // Ranges mirror StrategyPriority in backend/app/dto/routing_strategy.py.
  // The modal is not a <form> and Save is type="button", so the inputs' own
  // min/max attributes never trigger native validation — without these checks
  // an out-of-range number comes back as a bare "Validation error (422)" that
  // names neither the priority nor the field.
  const wholeNumberInRange = (raw: string, low: number, high: number) => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= low && n <= high;
  };

  const validationError = (): string | null => {
    if (!name.trim()) return t("workflows.strategyNameRequired");
    for (let i = 0; i < priorities.length; i++) {
      const p = priorities[i];
      const where = String(i + 1);
      // everyLeaf types its callback with the whole node union; narrow rather
      // than cast, since a group genuinely has no `value`
      if (!everyLeaf<TagNodeDraft>(p.tagRoot, (f) => f.kind !== "row" || f.value.trim() !== "")) {
        return t("workflows.strategyTagValueRequired");
      }
      // The MAX_TAG_* bounds hold for `tag_expression` and not for the legacy
      // `tag_filters`, so they are checked against the shape this priority is
      // about to be SENT as. Gating the add buttons is not enough: a tree
      // loaded from storage was never gated by them, and one click on ALL/ANY
      // turns an over-wide legacy list into an over-wide group. Without this
      // the server answers a bare "Validation error (422)" naming no priority.
      if (countLeaves(p.tagRoot) > 0 && !isFlatAnd(p.tagRoot)) {
        if (measureDepth(p.tagRoot) > MAX_TAG_DEPTH) {
          return t("workflows.strategyTagTooDeep", { n: where, max: String(MAX_TAG_DEPTH - 1) });
        }
        if (countLeaves(p.tagRoot) > MAX_TAG_LEAVES) {
          return t("workflows.strategyTagTooMany", { n: where, max: String(MAX_TAG_LEAVES) });
        }
        if (widestGroup(p.tagRoot) > MAX_TAG_CHILDREN) {
          return t("workflows.strategyTagGroupTooWide", { n: where, max: String(MAX_TAG_CHILDREN) });
        }
      }
      if (p.categoryOp !== NONE) {
        const has = p.categoryOp === "IS_IN" ? p.categoryValues.length > 0 : !!p.categoryValue;
        if (!has) return t("workflows.strategyCategoryValueRequired");
      }
      if (p.debtOp !== NONE && (p.debtAmount.trim() === "" || isNaN(Number(p.debtAmount)))) {
        return t("workflows.strategyDebtAmountRequired");
      }
      if (p.lastEffectiveDays.trim() !== "" && !wholeNumberInRange(p.lastEffectiveDays, 0, 3650)) {
        return t("workflows.strategyDaysOutOfRange", { n: where });
      }
      if (p.maxStops.trim() !== "" && !wholeNumberInRange(p.maxStops, 1, 200)) {
        return t("workflows.strategyMaxStopsOutOfRange", { n: where });
      }
    }
    return null;
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? apiRequest(`/routing-strategy/${editing.uuid}`, {
            method: "PUT",
            body: { name: name.trim(), config: buildConfig() },
          })
        : apiRequest("/routing-strategy/", {
            method: "POST",
            body: { name: name.trim(), config: buildConfig() },
          }),
    onSuccess: (saved: { name: string }) => {
      toast({ title: editing ? t("workflows.strategyUpdated") : t("workflows.strategyCreated") });
      setName("");
      setPriorities([emptyPriority()]);
      onOpenChange(false);
      onSaved(saved.name, editing?.name ?? null);
    },
    onError: (error) => {
      toast({
        title: editing ? t("workflows.strategyUpdateFailed") : t("workflows.strategyCreateFailed"),
        description: apiErrorMessage(error, ""),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const problem = validationError();
    if (problem) {
      toast({ title: problem, variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("workflows.editStrategyTitle") : t("workflows.createStrategyTitle")}</DialogTitle>
          <DialogDescription>{t("workflows.createStrategyDescription")}</DialogDescription>
        </DialogHeader>

        {/* free typing with the predefined catalog as suggestions */}
        <datalist id="strategy-tag-suggestions">
          {catalog.map((entry) => (
            <option key={entry.tag} value={entry.tag}>
              {labelFor(entry.tag)}
            </option>
          ))}
        </datalist>

        <div className="space-y-2">
          <Label htmlFor="strategy-name">{t("workflows.strategyName")}</Label>
          <Input
            id="strategy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            data-testid="input-strategy-name"
          />
        </div>

        <div className="space-y-4">
          {priorities.map((priority, pi) => (
            <div key={pi} className="rounded-md border p-3 space-y-3" data-testid={`priority-${pi}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {t("workflows.priorityN", { n: String(pi + 1) })}
                </span>
                {priorities.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPriorities((prev) => prev.filter((_, i) => i !== pi))}
                    data-testid={`remove-priority-${pi}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* tag filters — a tree, so a band can say
                  (one_time OR repeat) AND NOT blacklist. The root's ALL/ANY
                  sits on the label row rather than a line of its own: with up
                  to 10 priorities in one modal, a row per priority matters. */}
              <div className="space-y-2">
                {renderTagGroup(pi, priority.tagRoot, [], 1)}
              </div>

              {/* category filter */}
              <div className="space-y-2">
                <Label>{t("workflows.strategyCategoryFilter")}</Label>
                <div className="flex gap-2">
                  <Select
                    value={priority.categoryOp}
                    onValueChange={(op) =>
                      patchPriority(pi, { categoryOp: op, categoryValue: "", categoryValues: [] })
                    }
                  >
                    <SelectTrigger className="w-40" data-testid={`category-op-${pi}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("workflows.strategyNoFilter")}</SelectItem>
                      {CATEGORY_OPS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {t(`workflows.op${op}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(priority.categoryOp === "EQUAL" || priority.categoryOp === "NOT_EQUAL") && (
                    <Select
                      value={priority.categoryValue}
                      onValueChange={(v) => patchPriority(pi, { categoryValue: v })}
                    >
                      <SelectTrigger className="flex-1" data-testid={`category-value-${pi}`}>
                        <SelectValue placeholder={t("workflows.selectAnOption")} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {te(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {priority.categoryOp === "IS_IN" && (
                  <div className="flex flex-wrap gap-3">
                    {categories.map((c) => (
                      <label key={c} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={priority.categoryValues.includes(c)}
                          onCheckedChange={(checked) =>
                            patchPriority(pi, {
                              categoryValues: checked
                                ? [...priority.categoryValues, c]
                                : priority.categoryValues.filter((x) => x !== c),
                            })
                          }
                          data-testid={`category-check-${pi}-${c}`}
                        />
                        {te(c)}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* debt filter */}
              <div className="space-y-2">
                <Label>{t("workflows.strategyDebtFilter")}</Label>
                <div className="flex gap-2">
                  <Select
                    value={priority.debtOp}
                    onValueChange={(op) => patchPriority(pi, { debtOp: op })}
                  >
                    <SelectTrigger className="w-40" data-testid={`debt-op-${pi}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("workflows.strategyNoFilter")}</SelectItem>
                      {DEBT_OPS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {t(`workflows.op${op}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {priority.debtOp !== NONE && (
                    <>
                      <Input
                        type="number"
                        className="w-32"
                        value={priority.debtAmount}
                        placeholder={t("workflows.strategyAmount")}
                        onChange={(e) => patchPriority(pi, { debtAmount: e.target.value })}
                        data-testid={`debt-amount-${pi}`}
                      />
                      <Select
                        value={priority.debtCurrency}
                        onValueChange={(v) =>
                          patchPriority(pi, { debtCurrency: v as PriorityDraft["debtCurrency"] })
                        }
                      >
                        <SelectTrigger className="w-24" data-testid={`debt-currency-${pi}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {te(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
              </div>

              {/* recency + cap */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`led-${pi}`}>{t("workflows.strategyLastEffectiveDays")}</Label>
                  <Input
                    id={`led-${pi}`}
                    type="number"
                    min={0}
                    value={priority.lastEffectiveDays}
                    placeholder={t("workflows.strategyOff")}
                    onChange={(e) => patchPriority(pi, { lastEffectiveDays: e.target.value })}
                    data-testid={`last-effective-days-${pi}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cap-${pi}`}>{t("workflows.strategyMaxStops")}</Label>
                  <Input
                    id={`cap-${pi}`}
                    type="number"
                    min={1}
                    max={200}
                    value={priority.maxStops}
                    placeholder={t("workflows.strategyNoCap")}
                    onChange={(e) => patchPriority(pi, { maxStops: e.target.value })}
                    data-testid={`max-stops-${pi}`}
                  />
                </div>
              </div>
            </div>
          ))}

          {priorities.length < 10 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPriorities((prev) => [...prev, emptyPriority()])}
              data-testid="add-priority"
            >
              <Plus className="h-4 w-4 me-1" />
              {t("workflows.strategyAddPriority")}
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            data-testid="save-strategy"
          >
            {saveMutation.isPending ? t("common.saving") : t("workflows.strategySave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
