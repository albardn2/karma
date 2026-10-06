import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, FolderPlus, Plus, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTagCatalog } from "@/lib/tagCatalog";
import { countLeaves, newId, pathKey, updateAt } from "@/lib/filterTree";

/**
 * The map query builder: a TREE of groups, each joining its children with one
 * AND or OR. Mirrors backend dto/customer_query.
 *
 * The connector used to live on the ROW, as a column of AND/OR selects — which
 * is not grouping, only precedence, and reading it correctly required knowing
 * that AND binds tighter. A group owns one ALL/ANY choice instead, the word
 * between children becomes read-only, and mixed-connector sequences simply
 * cannot be expressed. Precedence stops being a concept the dispatcher has to
 * hold.
 */
export type QueryField =
  | "tags"
  | "debt"
  | "service_area"
  | "name"
  | "uuid"
  | "category"
  | "last_effective_visit";

export interface QueryRowDraft {
  kind: "row";
  id: string;
  field: QueryField;
  op: string;
  value: string; // IS_IN: comma-separated
  amount: string; // debt only
  currency: "SYP" | "USD"; // debt only
  days: string; // last_effective_visit, windowed ops only
}

export interface QueryGroupDraft {
  kind: "group";
  id: string;
  op: "AND" | "OR";
  children: QueryNodeDraft[];
}

export type QueryNodeDraft = QueryRowDraft | QueryGroupDraft;

export interface QueryRowPayload {
  kind: "row";
  field: QueryField;
  op: string;
  value?: string;
  amount?: number;
  currency?: string;
  days?: number;
}
export interface QueryGroupPayload {
  kind: "group";
  op: "AND" | "OR";
  children: QueryNodePayload[];
}
export type QueryNodePayload = QueryRowPayload | QueryGroupPayload;

const OPS: Record<QueryField, readonly string[]> = {
  tags: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  debt: ["LARGER_THAN", "SMALLER_THAN", "EQUAL"],
  service_area: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  name: ["EQUAL", "NOT_EQUAL", "IS_IN", "CONTAINS"],
  uuid: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  category: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  last_effective_visit: ["OLDER_THAN_DAYS", "WITHIN_DAYS", "NEVER", "EVER"],
};

const FIELDS: readonly QueryField[] = [
  "tags",
  "debt",
  "service_area",
  "name",
  "uuid",
  "category",
  "last_effective_visit",
];

/** The two visit operators that take a window; the other two take nothing. */
const WINDOWED = new Set(["OLDER_THAN_DAYS", "WITHIN_DAYS"]);

/** dto/customer_query: days is Field(None, ge=1, le=3650). */
const MAX_DAYS = 3650;

// Kept in step with dto/customer_query: depth 3 means the root plus two nested
// levels, which is all an AND-of-ORs-of-ANDs needs.
export const MAX_DEPTH = 3;
export const MAX_LEAVES = 20;
// Per GROUP, mirroring dto/customer_query.MAX_CHILDREN. The flat toolbar this
// replaced guarded `rows.length >= 12`; the rewrite swapped that for a
// tree-wide leaf budget and dropped the per-group bound entirely, so a 13th
// condition in one group was buildable and 422'd on Apply with a message that
// names no group. Note MAX_LEAVES > MAX_CHILDREN by design: 20 leaves are only
// reachable by nesting.
export const MAX_CHILDREN = 12;

export const blankQueryRow = (): QueryRowDraft => ({
  kind: "row",
  id: newId(),
  field: "tags",
  op: "EQUAL",
  value: "",
  amount: "",
  currency: "SYP",
  days: "",
});

export const blankQueryGroup = (op: "AND" | "OR"): QueryGroupDraft => ({
  kind: "group",
  id: newId(),
  op,
  children: [blankQueryRow()],
});

export const blankQueryRoot = (): QueryGroupDraft => blankQueryGroup("AND");

const rowComplete = (r: QueryRowDraft): boolean => {
  if (r.field === "debt") return r.amount.trim() !== "" && !isNaN(Number(r.amount));
  if (r.field === "last_effective_visit") {
    // NEVER / EVER are complete with nothing typed
    if (!WINDOWED.has(r.op)) return true;
    const n = Number(r.days);
    // the same window the DTO accepts (ge=1, le=3650) — a larger number would
    // otherwise pass here and come back as a 422 naming no row
    return r.days.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_DAYS;
  }
  return r.value.trim() !== "";
};

export const nodeComplete = (n: QueryNodeDraft): boolean =>
  n.kind === "row" ? rowComplete(n) : n.children.length > 0 && n.children.every(nodeComplete);

export function buildQueryPayload(node: QueryNodeDraft): QueryNodePayload {
  if (node.kind === "group") {
    return { kind: "group", op: node.op, children: node.children.map(buildQueryPayload) };
  }
  const out: QueryRowPayload = { kind: "row", field: node.field, op: node.op };
  if (node.field === "debt") {
    out.amount = Number(node.amount);
    out.currency = node.currency;
  } else if (node.field === "last_effective_visit") {
    // NEVER / EVER carry nothing, and the backend REFUSES a stray days —
    // sending one would 422 the whole query over a field the user cannot see
    if (WINDOWED.has(node.op)) out.days = Number(node.days);
  } else {
    // IS_IN stays a comma-separated string — the backend splits it
    out.value = node.value.trim();
  }
  return out;
}


interface CustomerQueryToolbarProps {
  categories: string[];
  active: boolean;
  matchCount: number | null;
  loading: boolean;
  /** the DRAFT tree lives with the page, not here: the toolbar unmounts on
   *  every view switch, and an applied query whose editor came back blank
   *  could neither be seen nor edited */
  root: QueryGroupDraft;
  onRootChange: (root: QueryGroupDraft) => void;
  onApply: (expression: QueryNodePayload) => void;
  onClear: () => void;
}

export function CustomerQueryToolbar({
  categories,
  active,
  matchCount,
  loading,
  root,
  onRootChange,
  onApply,
  onClear,
}: CustomerQueryToolbarProps) {
  const { t, te } = useLanguage();
  const { catalog, labelFor } = useTagCatalog();
  const [open, setOpen] = useState(false);

  // areas are the one picker source the page does not already fetch
  const { data: areas = [], isPending: areasPending } = useQuery<
    Array<{ uuid: string; name: string }>
  >({
    // the blueprint is /service-area/ with a HYPHEN. The underscore spelling
    // 404s, so `areas` was always empty and every service-area row silently
    // fell back to free text instead of the picker below. Pre-dates the group
    // builder — the bug is as old as the toolbar.
    queryKey: ["/service-area/", "query-toolbar"],
    // Every page, not just the first. `per_page` is capped at 100 server-side
    // (above it the request 422s), and the picker is the ONLY way to choose an
    // area for EQUAL / NOT_EQUAL — so a tenant past 100 areas would simply be
    // unable to select the rest. The page cap is a stop against a runaway
    // loop, not a real limit: nothing here is near it.
    queryFn: async () => {
      const all: Array<{ uuid: string; name: string }> = [];
      for (let page = 1; page <= 20; page++) {
        const res = await apiRequest(`/service-area/?page=${page}&per_page=100`);
        all.push(...(res?.items ?? []));
        if (page >= (res?.pages ?? 1)) break;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const mutate = (path: number[], fn: (n: QueryNodeDraft) => QueryNodeDraft | null) => {
    const next = updateAt(root, path, fn);
    // The root itself can never vanish — emptying it returns a fresh blank row.
    // Keep the root's own ALL/ANY though: deleting the last condition is not a
    // statement about how the next ones should combine, and silently flipping
    // a deliberate "Match ANY" back to ALL changes what the next query means.
    onRootChange(
      next && next.kind === "group"
        ? next
        : { ...blankQueryRoot(), op: root.op },
    );
  };

  const patchRow = (path: number[], changes: Partial<QueryRowDraft>) =>
    mutate(path, (n) => (n.kind === "row" ? { ...n, ...changes } : n));

  const setField = (path: number[], field: QueryField) =>
    // a field change resets op, value, amount AND days: the old ones may not
    // exist for the new field, and a stray days is refused outright
    patchRow(path, { field, op: OPS[field][0], value: "", amount: "", days: "" });

  const setOp = (path: number[], row: QueryRowDraft, op: string) => {
    // crossing the IS_IN boundary changes what the value MEANS (comma list vs
    // one pick) and which control renders it — a kept value would sit invisible
    // behind a blank select and still be submitted. Leaving a windowed op does
    // the same to `days`, which the backend refuses rather than ignores.
    const crossedIsIn = (row.op === "IS_IN") !== (op === "IS_IN");
    const leftWindow = WINDOWED.has(row.op) && !WINDOWED.has(op);
    patchRow(path, {
      op,
      ...(crossedIsIn ? { value: "" } : {}),
      ...(leftWindow ? { days: "" } : {}),
    });
  };

  const leaves = useMemo(() => countLeaves(root), [root]);
  const complete = useMemo(() => nodeComplete(root), [root]);
  const budgetFull = leaves >= MAX_LEAVES;


  const valueControl = (row: QueryRowDraft, path: number[]) => {
    const key = pathKey(path);
    if (row.field === "debt") {
      return (
        <>
          <Input
            type="number"
            className="w-32"
            value={row.amount}
            placeholder={t("customers.queryAmount")}
            onChange={(e) => patchRow(path, { amount: e.target.value })}
            data-testid={`query-amount-${key}`}
          />
          <Select
            value={row.currency}
            onValueChange={(currency) => patchRow(path, { currency: currency as "SYP" | "USD" })}
          >
            <SelectTrigger className="w-24" data-testid={`query-currency-${key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SYP">SYP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </>
      );
    }

    if (row.field === "last_effective_visit") {
      // NEVER / EVER are whole conditions on their own
      if (!WINDOWED.has(row.op)) return null;
      return (
        <Input
          type="number"
          min={1}
          max={MAX_DAYS}
          className="w-28"
          value={row.days}
          placeholder={t("customers.queryDays")}
          onChange={(e) => patchRow(path, { days: e.target.value })}
          data-testid={`query-days-${key}`}
        />
      );
    }

    // single-pick selects where a catalog exists and the op takes ONE value;
    // IS_IN falls back to comma-separated text (the backend splits it)
    if (row.op !== "IS_IN" && row.field === "category" && categories.length > 0) {
      return (
        <Select value={row.value} onValueChange={(value) => patchRow(path, { value })}>
          <SelectTrigger className="flex-1 min-w-32" data-testid={`query-value-${key}`}>
            <SelectValue placeholder={t("customers.queryPickValue")} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {te(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    // The control must not depend on whether the fetch has landed yet: it
    // used to render free text while the request was in flight and then swap
    // to a Select, so anything typed in that window vanished from view while
    // still being submitted. Pending shows the picker, disabled.
    if (row.op !== "IS_IN" && row.field === "service_area" && (areasPending || areas.length > 0)) {
      // keep a value the list does not contain selectable and VISIBLE rather
      // than letting Radix fall back to the placeholder and hide it
      const unlisted = row.value && !areas.some((a) => a.uuid === row.value);
      return (
        <Select
          value={row.value}
          onValueChange={(value) => patchRow(path, { value })}
          disabled={areasPending}
        >
          <SelectTrigger className="flex-1 min-w-32" data-testid={`query-value-${key}`}>
            <SelectValue placeholder={t("customers.queryPickValue")} />
          </SelectTrigger>
          <SelectContent>
            {unlisted && (
              <SelectItem key={row.value} value={row.value}>
                {row.value}
              </SelectItem>
            )}
            {areas.map((a) => (
              <SelectItem key={a.uuid} value={a.uuid}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        className="flex-1 min-w-32"
        list={
          row.field === "tags"
            ? "customer-query-tags"
            : row.field === "service_area"
              ? "customer-query-areas"
              : undefined
        }
        value={row.value}
        placeholder={
          row.op === "IS_IN" ? t("customers.queryListPlaceholder") : t("customers.queryValuePlaceholder")
        }
        onChange={(e) => patchRow(path, { value: e.target.value })}
        data-testid={`query-value-${key}`}
      />
    );
  };

  const renderRow = (row: QueryRowDraft, path: number[]) => {
    const key = pathKey(path);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Select value={row.field} onValueChange={(field) => setField(path, field as QueryField)}>
          <SelectTrigger className="w-40" data-testid={`query-field-${key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELDS.map((f) => (
              <SelectItem key={f} value={f}>
                {t(`customers.queryField_${f}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={row.op} onValueChange={(op) => setOp(path, row, op)}>
          <SelectTrigger className="w-44" data-testid={`query-op-${key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPS[row.field].map((op) => (
              <SelectItem key={op} value={op}>
                {t(`workflows.op${op}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {valueControl(row, path)}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => mutate(path, () => null)}
          title={t("customers.queryRemoveCondition")}
          data-testid={`query-remove-${key}`}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* The one convention surprising enough to say out loud rather than
            leave to be discovered in the match count. */}
        {row.field === "last_effective_visit" && row.op === "OLDER_THAN_DAYS" && (
          <p className="basis-full text-xs text-gray-500">{t("customers.queryNeverVisitedHint")}</p>
        )}
      </div>
    );
  };

  const renderGroup = (group: QueryGroupDraft, path: number[], depth: number) => {
    const key = pathKey(path);
    const isRoot = path.length === 0;
    const canNest = depth < MAX_DEPTH;
    // a nested group counts against the same cap as a condition — both are children
    const groupFull = group.children.length >= MAX_CHILDREN;
    return (
      <div
        className={
          isRoot
            ? "space-y-2"
            : "space-y-2 rounded-md border-s-2 border-[#5469D4]/40 bg-gray-50/60 dark:bg-gray-800/40 ps-2 sm:ps-3 py-2"
        }
        data-testid={isRoot ? "query-group-root" : `query-group-${key}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Two buttons rather than a select: the choice is binary and this is
              the house segmented-control pattern. */}
          <div className="flex items-center gap-1" data-testid={`query-group-connector-${key}`}>
            <Button
              variant={group.op === "AND" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => mutate(path, (n) => ({ ...(n as QueryGroupDraft), op: "AND" }))}
            >
              {t("customers.queryGroupAll")}
            </Button>
            <Button
              variant={group.op === "OR" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => mutate(path, (n) => ({ ...(n as QueryGroupDraft), op: "OR" }))}
            >
              {t("customers.queryGroupAny")}
            </Button>
          </div>
          {!isRoot && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => mutate(path, () => null)}
              title={t("customers.queryRemoveGroup")}
              data-testid={`query-group-remove-${key}`}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {group.children.map((child, i) => {
          const childPath = [...path, i];
          return (
            <div key={child.id} className="space-y-2">
              {i > 0 && (
                <p
                  aria-hidden
                  className="text-[11px] font-semibold uppercase tracking-wide text-gray-400"
                  data-testid={`query-joiner-${pathKey(childPath)}`}
                >
                  {group.op === "AND" ? t("customers.queryAnd") : t("customers.queryOr")}
                </p>
              )}
              {child.kind === "row"
                ? renderRow(child, childPath)
                : renderGroup(child, childPath, depth + 1)}
            </div>
          );
        })}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={budgetFull || groupFull}
            title={groupFull ? t("customers.queryMaxChildren") : undefined}
            onClick={() =>
              mutate(path, (n) => ({
                ...(n as QueryGroupDraft),
                children: [...(n as QueryGroupDraft).children, blankQueryRow()],
              }))
            }
            data-testid={isRoot ? "query-add-row" : `query-add-row-${key}`}
          >
            <Plus className="h-3.5 w-3.5 me-1" />
            {t("customers.queryAddCondition")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={budgetFull || !canNest || groupFull}
            title={
              !canNest
                ? t("customers.queryMaxDepth")
                : groupFull
                  ? t("customers.queryMaxChildren")
                  : undefined
            }
            onClick={() =>
              mutate(path, (n) => {
                const g = n as QueryGroupDraft;
                // the opposite op by default: a same-op nested group is a no-op,
                // so the other one is the only useful seed
                return {
                  ...g,
                  children: [...g.children, blankQueryGroup(g.op === "AND" ? "OR" : "AND")],
                };
              })
            }
            data-testid={isRoot ? "query-add-group" : `query-add-group-${key}`}
          >
            <FolderPlus className="h-3.5 w-3.5 me-1" />
            {t("customers.queryAddGroup")}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="mb-3">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Button
            variant={open || active ? "default" : "outline"}
            size="sm"
            onClick={() => setOpen((o) => !o)}
            data-testid="query-toolbar-toggle"
          >
            <Filter className="h-4 w-4 me-1" />
            {t("customers.queryToolbar")}
          </Button>
          {active && matchCount !== null && (
            <Badge variant="secondary" data-testid="query-match-count">
              {t("customers.queryMatches", { count: String(matchCount) })}
            </Badge>
          )}
          {active && (
            <Button variant="ghost" size="sm" onClick={onClear} data-testid="query-clear">
              <X className="h-4 w-4 me-1" />
              {t("customers.queryClear")}
            </Button>
          )}
        </div>

        {open && (
          <div className="mt-3 space-y-2 max-h-[55vh] overflow-y-auto">
            {/* typing suggestions for tags and (IS_IN) areas */}
            <datalist id="customer-query-tags">
              {catalog.map((entry) => (
                <option key={entry.tag} value={entry.tag}>
                  {labelFor(entry.tag)}
                </option>
              ))}
            </datalist>
            <datalist id="customer-query-areas">
              {areas.map((a) => (
                <option key={a.uuid} value={a.name} />
              ))}
            </datalist>

            {renderGroup(root, [], 1)}

            <div className="sticky bottom-0 flex items-center gap-2 border-t bg-white/95 pt-2 dark:bg-gray-900/95">
              <Button
                size="sm"
                onClick={() => onApply(buildQueryPayload(root))}
                disabled={!complete || loading}
                aria-describedby="query-budget"
                data-testid="query-apply"
              >
                <Search className="h-4 w-4 me-1" />
                {loading ? t("customers.queryRunning") : t("customers.queryApply")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRootChange(blankQueryRoot())}
                data-testid="query-reset"
              >
                {t("customers.queryReset")}
              </Button>
              <span id="query-budget" className="text-xs text-gray-500" data-testid="query-row-budget">
                {t("customers.queryRowBudget", { used: String(leaves), max: String(MAX_LEAVES) })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
