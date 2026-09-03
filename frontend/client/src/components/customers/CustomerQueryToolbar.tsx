import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Plus, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTagCatalog } from "@/lib/tagCatalog";

/** One row of the map query: field + operator + value, chained to the
 *  previous row with AND/OR. Mirrors backend dto/customer_query — the ops per
 *  field, the comma-separated IS_IN convention (the backend splits on both
 *  the ASCII and Arabic comma), and SQL precedence (AND binds tighter). */
export type QueryField = "tags" | "debt" | "service_area" | "name" | "uuid" | "category";

export interface QueryRowDraft {
  field: QueryField;
  op: string;
  value: string; // IS_IN: comma-separated; debt rows leave it empty
  amount: string; // debt only
  currency: "SYP" | "USD"; // debt only
  connector: "AND" | "OR"; // ignored on the first row
}

export interface QueryRowPayload {
  field: QueryField;
  op: string;
  value?: string;
  amount?: number;
  currency?: string;
  connector?: "AND" | "OR";
}

const OPS: Record<QueryField, readonly string[]> = {
  tags: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  debt: ["LARGER_THAN", "SMALLER_THAN", "EQUAL"],
  service_area: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  name: ["EQUAL", "NOT_EQUAL", "IS_IN", "CONTAINS"],
  uuid: ["EQUAL", "NOT_EQUAL", "IS_IN"],
  category: ["EQUAL", "NOT_EQUAL", "IS_IN"],
};

const FIELDS: readonly QueryField[] = ["tags", "debt", "service_area", "name", "uuid", "category"];

export const blankQueryRow = (): QueryRowDraft => ({
  field: "tags",
  op: "EQUAL",
  value: "",
  amount: "",
  currency: "SYP",
  connector: "AND",
});

const rowComplete = (r: QueryRowDraft) =>
  r.field === "debt" ? r.amount.trim() !== "" && !isNaN(Number(r.amount)) : r.value.trim() !== "";

export function buildQueryPayload(rows: QueryRowDraft[]): QueryRowPayload[] {
  return rows.map((r, i) => {
    const out: QueryRowPayload = { field: r.field, op: r.op };
    if (r.field === "debt") {
      out.amount = Number(r.amount);
      out.currency = r.currency;
    } else {
      // IS_IN stays a comma-separated string — the backend splits it
      out.value = r.value.trim();
    }
    if (i > 0) out.connector = r.connector;
    return out;
  });
}

interface CustomerQueryToolbarProps {
  categories: string[];
  active: boolean;
  matchCount: number | null;
  loading: boolean;
  /** row DRAFTS live with the page, not here: the toolbar unmounts on every
   *  view switch, and an applied query whose editor came back blank could
   *  neither be seen nor edited */
  rows: QueryRowDraft[];
  onRowsChange: (rows: QueryRowDraft[]) => void;
  onApply: (rows: QueryRowPayload[]) => void;
  onClear: () => void;
}

export function CustomerQueryToolbar({
  categories,
  active,
  matchCount,
  loading,
  rows,
  onRowsChange,
  onApply,
  onClear,
}: CustomerQueryToolbarProps) {
  const { t, te } = useLanguage();
  const { catalog, labelFor } = useTagCatalog();
  const [open, setOpen] = useState(false);

  // areas are the one picker source the page does not already fetch
  const { data: areasData } = useQuery<{ items: Array<{ uuid: string; name: string }> }>({
    queryKey: ["/service_area/"],
    queryFn: () => apiRequest("/service_area/?per_page=100"),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const areas = areasData?.items ?? [];

  const patch = (i: number, changes: Partial<QueryRowDraft>) =>
    onRowsChange(rows.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));

  const setField = (i: number, field: QueryField) =>
    // a field change resets op and value: the old ones may not exist for it
    patch(i, { field, op: OPS[field][0], value: "", amount: "" });

  const setOp = (i: number, op: string) => {
    // crossing the IS_IN boundary changes what the value MEANS (comma list vs
    // one pick) and which control renders it — a kept value would sit invisible
    // behind a blank select and still be submitted
    const crossed = (rows[i].op === "IS_IN") !== (op === "IS_IN");
    patch(i, crossed ? { op, value: "" } : { op });
  };

  const removeRow = (i: number) =>
    onRowsChange(rows.length === 1 ? [blankQueryRow()] : rows.filter((_, idx) => idx !== i));

  const allComplete = useMemo(() => rows.every(rowComplete), [rows]);

  const valueControl = (row: QueryRowDraft, i: number) => {
    if (row.field === "debt") {
      return (
        <>
          <Input
            type="number"
            className="w-32"
            value={row.amount}
            placeholder={t("customers.queryAmount")}
            onChange={(e) => patch(i, { amount: e.target.value })}
            data-testid={`query-amount-${i}`}
          />
          <Select value={row.currency} onValueChange={(currency) => patch(i, { currency: currency as "SYP" | "USD" })}>
            <SelectTrigger className="w-24" data-testid={`query-currency-${i}`}>
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

    // single-pick selects where a catalog exists and the op takes ONE value;
    // IS_IN falls back to comma-separated text (the backend splits it)
    if (row.op !== "IS_IN" && row.field === "category" && categories.length > 0) {
      return (
        <Select value={row.value} onValueChange={(value) => patch(i, { value })}>
          <SelectTrigger className="flex-1 min-w-32" data-testid={`query-value-${i}`}>
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
    if (row.op !== "IS_IN" && row.field === "service_area" && areas.length > 0) {
      return (
        <Select value={row.value} onValueChange={(value) => patch(i, { value })}>
          <SelectTrigger className="flex-1 min-w-32" data-testid={`query-value-${i}`}>
            <SelectValue placeholder={t("customers.queryPickValue")} />
          </SelectTrigger>
          <SelectContent>
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
        list={row.field === "tags" ? "customer-query-tags" : row.field === "service_area" ? "customer-query-areas" : undefined}
        value={row.value}
        placeholder={row.op === "IS_IN" ? t("customers.queryListPlaceholder") : t("customers.queryValuePlaceholder")}
        onChange={(e) => patch(i, { value: e.target.value })}
        data-testid={`query-value-${i}`}
      />
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
          <div className="mt-3 space-y-2">
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

            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                {i > 0 ? (
                  <Select value={row.connector} onValueChange={(connector) => patch(i, { connector: connector as "AND" | "OR" })}>
                    <SelectTrigger className="w-20" data-testid={`query-connector-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">{t("customers.queryAnd")}</SelectItem>
                      <SelectItem value="OR">{t("customers.queryOr")}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-20 text-xs text-gray-500 text-center">{t("customers.queryWhere")}</div>
                )}

                <Select value={row.field} onValueChange={(field) => setField(i, field as QueryField)}>
                  <SelectTrigger className="w-36" data-testid={`query-field-${i}`}>
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

                <Select value={row.op} onValueChange={(op) => setOp(i, op)}>
                  <SelectTrigger className="w-36" data-testid={`query-op-${i}`}>
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

                {valueControl(row, i)}

                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(i)} data-testid={`query-remove-${i}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRowsChange([...rows, blankQueryRow()])}
                disabled={rows.length >= 12}
                data-testid="query-add-row"
              >
                <Plus className="h-4 w-4 me-1" />
                {t("customers.queryAddCondition")}
              </Button>
              <Button
                size="sm"
                onClick={() => onApply(buildQueryPayload(rows))}
                disabled={!allComplete || loading}
                data-testid="query-apply"
              >
                <Search className="h-4 w-4 me-1" />
                {loading ? t("customers.queryRunning") : t("customers.queryApply")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
