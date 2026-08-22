import { useState } from "react";
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

interface TagFilterDraft {
  op: (typeof TAG_OPS)[number];
  value: string; // IS_IN: comma-separated (the backend splits; commas can't occur inside tags)
}

interface PriorityDraft {
  tagFilters: TagFilterDraft[];
  categoryOp: string; // NONE = no category filter
  categoryValue: string; // EQUAL / NOT_EQUAL
  categoryValues: string[]; // IS_IN
  debtOp: string; // NONE = no debt filter
  debtAmount: string;
  debtCurrency: (typeof CURRENCIES)[number];
  lastEffectiveDays: string; // '' = off
  maxStops: string; // '' = no per-priority cap
}

const emptyPriority = (): PriorityDraft => ({
  tagFilters: [],
  categoryOp: NONE,
  categoryValue: "",
  categoryValues: [],
  debtOp: NONE,
  debtAmount: "",
  debtCurrency: "SYP",
  lastEffectiveDays: "",
  maxStops: "",
});

interface CreateRoutingStrategyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // called with the saved strategy's canonical name after a successful create
  onCreated: (name: string) => void;
}

export function CreateRoutingStrategyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateRoutingStrategyDialogProps) {
  const { t, te } = useLanguage();
  const { toast } = useToast();
  const { catalog, labelFor } = useTagCatalog();

  const [name, setName] = useState("");
  const [priorities, setPriorities] = useState<PriorityDraft[]>([emptyPriority()]);

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/customer/categories"],
    enabled: open,
  });

  const patchPriority = (index: number, patch: Partial<PriorityDraft>) => {
    setPriorities((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const buildConfig = () => ({
    priorities: priorities.map((p) => {
      const priority: Record<string, unknown> = {};
      if (p.tagFilters.length) {
        priority.tag_filters = p.tagFilters.map((f) => ({ op: f.op, value: f.value.trim() }));
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
      for (const f of p.tagFilters) {
        if (!f.value.trim()) return t("workflows.strategyTagValueRequired");
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

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("/routing-strategy/", {
        method: "POST",
        body: { name: name.trim(), config: buildConfig() },
      }),
    onSuccess: (created: { name: string }) => {
      toast({ title: t("workflows.strategyCreated") });
      setName("");
      setPriorities([emptyPriority()]);
      onOpenChange(false);
      onCreated(created.name);
    },
    onError: (error) => {
      toast({
        title: t("workflows.strategyCreateFailed"),
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
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("workflows.createStrategyTitle")}</DialogTitle>
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

              {/* tag filters */}
              <div className="space-y-2">
                <Label>{t("workflows.strategyTagFilters")}</Label>
                {priority.tagFilters.map((f, fi) => (
                  <div key={fi} className="flex gap-2 items-center">
                    <Select
                      value={f.op}
                      onValueChange={(op) =>
                        patchPriority(pi, {
                          tagFilters: priority.tagFilters.map((x, i) =>
                            i === fi ? { ...x, op: op as TagFilterDraft["op"] } : x
                          ),
                        })
                      }
                    >
                      <SelectTrigger className="w-40" data-testid={`tag-op-${pi}-${fi}`}>
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
                      value={f.value}
                      placeholder={
                        f.op === "IS_IN"
                          ? t("workflows.strategyTagListPlaceholder")
                          : t("workflows.strategyTagPlaceholder")
                      }
                      onChange={(e) =>
                        patchPriority(pi, {
                          tagFilters: priority.tagFilters.map((x, i) =>
                            i === fi ? { ...x, value: e.target.value } : x
                          ),
                        })
                      }
                      data-testid={`tag-value-${pi}-${fi}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patchPriority(pi, {
                          tagFilters: priority.tagFilters.filter((_, i) => i !== fi),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patchPriority(pi, {
                      tagFilters: [...priority.tagFilters, { op: "EQUAL", value: "" }],
                    })
                  }
                  data-testid={`add-tag-filter-${pi}`}
                >
                  <Plus className="h-4 w-4 me-1" />
                  {t("workflows.strategyAddTagFilter")}
                </Button>
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
            disabled={createMutation.isPending}
            data-testid="save-strategy"
          >
            {createMutation.isPending ? t("common.saving") : t("workflows.strategySave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
