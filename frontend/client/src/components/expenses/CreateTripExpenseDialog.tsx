import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";

const CURRENCIES = ["USD", "SYP"];

/**
 * Book an expense against the trip this workflow execution is running.
 *
 * The trip is resolved from the execution here rather than passed in: the
 * execution detail page knows its own uuid, and a trip is reachable from it via
 * the trip list filter, so the caller does not have to thread it through.
 */
export function CreateTripExpenseDialog({
  workflowExecutionUuid,
}: {
  workflowExecutionUuid: string;
}) {
  const { t, te } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("SYP");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const { data: tripPage } = useQuery<any>({
    queryKey: ["/trip/", "for-expense", workflowExecutionUuid],
    queryFn: () =>
      apiRequest(`/trip/?workflow_execution_uuid=${workflowExecutionUuid}&per_page=1`),
    enabled: open && !!workflowExecutionUuid,
  });
  const trip = (tripPage?.items ?? [])[0];

  const { data: categories } = useQuery<string[]>({
    queryKey: ["/expense/categories"],
    queryFn: () => apiRequest("/expense/categories"),
    enabled: open,
  });

  const reset = () => {
    setAmount("");
    setCategory("");
    setDescription("");
  };

  const amountNumber = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(amountNumber) && amountNumber > 0;
  const canSubmit = !!trip && !!category && amountValid;

  const createExpense = useMutation({
    mutationFn: () =>
      apiRequest("/expense/", {
        method: "POST",
        body: {
          amount: amountNumber,
          currency,
          category,
          trip_uuid: trip.uuid,
          ...(description ? { description } : {}),
          // A trip cost is money already spent on the road, so it is always
          // booked as paid — there is no unpaid state to represent here, and no
          // switch to get it wrong.
          should_pay: true,
        },
      }),
    onSuccess: () => {
      // the trip's expense list and the expense analytics both read these
      queryClient.invalidateQueries({ queryKey: ["/expense/"] });
      queryClient.invalidateQueries({ queryKey: ["/payout/"] });
      toast({
        title: t("expenses.tripExpenseCreated"),
        description: `${amountNumber} ${currency} · ${te(category)}`,
      });
      reset();
      setOpen(false);
    },
    onError: (e: any) =>
      toast({
        title: t("expenses.tripExpenseFailed"),
        description: e?.message,
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" data-testid="create-trip-expense">
          <Receipt className="h-4 w-4" />
          {t("expenses.createExpense")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("expenses.tripExpenseTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* which trip this lands on — read-only, since it comes from the run */}
          <div className="space-y-1.5">
            <Label>{t("nav.trips")}</Label>
            <p
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              data-testid="trip-expense-trip"
            >
              {trip
                ? `${trip.vehicle_plate || trip.uuid.slice(0, 8)}${
                    trip.assigned_username ? ` · ${trip.assigned_username}` : ""
                  }`
                : t("common.loading")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.amount")} *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                data-testid="trip-expense-amount"
              />
              {amount !== "" && !amountValid && (
                <p className="text-xs text-red-600">
                  {t("financial.amountMustBePositive")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.currency")} *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="trip-expense-currency">
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
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("expenses.categoriesFilter")} *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="trip-expense-category">
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {te(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("expenses.tripExpenseNotesPlaceholder")}
              data-testid="trip-expense-notes"
            />
          </div>

          {/* no switch: this always books the payout, against the default
              financial account for the currency */}
          <p className="text-xs text-muted-foreground" data-testid="trip-expense-paid-note">
            {t("expenses.alwaysPaidNote")}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            className="brand-gradient"
            disabled={!canSubmit || createExpense.isPending}
            onClick={() => createExpense.mutate()}
            data-testid="submit-trip-expense"
          >
            {createExpense.isPending ? t("common.loading") : t("expenses.createExpense")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
