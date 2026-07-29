import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Input } from "@/components/ui/input";

// money is DOUBLE PRECISION end to end; never render or send the raw float
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export function OrderDetailDialog({
  orderUuid,
  tripStopUuid,
  open,
  onOpenChange,
}: {
  orderUuid: string | null;
  tripStopUuid?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [doFulfill, setDoFulfill] = useState(true);
  const [doPay, setDoPay] = useState(true);

  const detailKey = ["/customer-order/with-items-and-invoice/", orderUuid];
  const { data, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: async () => apiRequest(`/customer-order/with-items-and-invoice/${orderUuid}`),
    enabled: open && !!orderUuid,
  });

  const order = data?.customer_order;
  const invoice = data?.invoices?.[0];
  const items = (order?.customer_order_items || []).filter((i: any) => !i.is_deleted);
  const unfulfilled = items.filter((i: any) => !i.is_fulfilled);
  const amountDue = invoice?.net_amount_due ?? order?.net_amount_due ?? 0;
  const currency = order?.currency || "";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: detailKey });
    queryClient.refetchQueries({ queryKey: detailKey });
    queryClient.invalidateQueries({ queryKey: ["/customer-order/"] });
    queryClient.invalidateQueries({ queryKey: ["/customer/"] }); // refresh customer balance
  };

  const canFulfill = unfulfilled.length > 0;
  // matches the backend's MONEY_TOLERANCE: a balance it already treats as
  // settled must not offer a payment the guard would refuse
  const canPay = amountDue > 0.005;

  // The amount to pay, as a string so the field can be cleared while typing.
  // Seeded with the whole balance, which keeps the old behaviour — leave it
  // alone and Submit settles the order; edit it down to take part of the money.
  // Re-seeded whenever the balance changes, so after a partial payment the field
  // offers the NEW remainder rather than the amount already collected.
  // The balance to the cent. EVERYTHING downstream is based on this one value —
  // the prefill, the ceiling, the max, the error text and the Full balance button
  // — because mixing the rounded and unrounded bases made the field reject its own
  // prefill: a 1.045 balance seeds 1.05, while 1.045 + 0.005 is 1.0499999999999998
  // in float, so 1.05 <= that is false.
  const dueRounded = round2(amountDue);

  const [payAmount, setPayAmount] = useState("");
  useEffect(() => {
    if (canPay) setPayAmount(String(dueRounded));
  }, [dueRounded, canPay]);

  const payNumber = Number(payAmount);
  const payAmountValid =
    payAmount.trim() !== "" &&
    Number.isFinite(payNumber) &&
    payNumber > 0 &&
    // no slack needed now that the ceiling and the prefill are the same rounded
    // number: the prefill is exactly dueRounded, and anything above it is an
    // overpayment the backend would refuse anyway
    payNumber <= dueRounded;
  const remainingAfter = payAmountValid ? round2(dueRounded - payNumber) : null;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (doFulfill && canFulfill) {
        await apiRequest("/customer-order-item/fulfill-items", {
          method: "POST",
          body: {
            items: unfulfilled.map((i: any) => ({ customer_order_item_uuid: i.uuid })),
            trip_stop_uuid: tripStopUuid || null, // attribute the vehicle sale to the current stop
          },
        });
      }
      if (doPay && canPay && payAmountValid) {
        await apiRequest("/payment/", {
          method: "POST",
          body: {
            invoice_uuid: invoice.uuid,
            financial_account_uuid: null, // default account (by currency) on the backend
            // whatever is in the field: the full balance by default, or less for
            // a part payment. Rounded to the cent so a float tail cannot be read
            // as an overpayment.
            amount: round2(payNumber),
            currency,
            payment_method: "cash", // default method
            trip_stop_uuid: tripStopUuid || null, // attribute cash to the current trip stop
          },
        });
      }
    },
    onSuccess: () => {
      toast({ title: t('customerOrders.orderUpdated'), description: t('customerOrders.orderUpdatedDesc') });
      // refresh the lists behind the dialog, then get out of the way: the work is
      // done, and staying open on a stale balance invites a second payment
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: t('common.error'), description: e.message, variant: "destructive" }),
  });

  const nothingSelected =
    !(doFulfill && canFulfill) && !(doPay && canPay && payAmountValid);
  // Asking to record a payment with an unusable amount must not quietly do the
  // OTHER half of the job. Without this, clearing the field and hitting Submit
  // fulfilled the items, recorded no cash, and still reported success — the
  // driver would believe the money was taken.
  const payBlocked = doPay && canPay && !payAmountValid;

  const fmtDate = (s?: string) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('customerOrders.orderDetailsTitle')}</DialogTitle>
        </DialogHeader>

        {isLoading || !order ? (
          <div className="text-sm text-gray-500 py-6 text-center">{t('common.loading')}</div>
        ) : (
          <div className="space-y-4">
            {/* header */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">{fmtDate(order.created_at)}</div>
              <div className="flex gap-2">
                <Badge variant={order.is_paid ? "secondary" : "destructive"}>
                  {order.is_paid ? t('customerOrders.paid') : t('customerOrders.unpaid')}
                </Badge>
                <Badge variant={order.is_fulfilled ? "secondary" : "outline"}>
                  {order.is_fulfilled ? t('customerOrders.fulfilled') : t('customerOrders.unfulfilled')}
                </Badge>
              </div>
            </div>

            {/* items */}
            <div className="border rounded-md divide-y">
              {items.map((i: any) => (
                <div key={i.uuid} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{i.material_name} × {i.quantity} {i.unit || ""}</span>
                  <Badge variant={i.is_fulfilled ? "secondary" : "outline"} className="text-xs">
                    {i.is_fulfilled ? t('customerOrders.itemFulfilled') : t('customerOrders.itemPending')}
                  </Badge>
                </div>
              ))}
            </div>

            {/* totals */}
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">{t('common.total')}</span><span className="tabular-nums">{round2(invoice?.total_amount ?? order.total_adjusted_amount ?? 0)} {currency}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('customerOrders.paid')}</span><span className="tabular-nums">{round2(invoice?.net_amount_paid ?? order.net_amount_paid ?? 0)} {currency}</span></div>
              {/* the outstanding balance, which stays visible while it is only
                  partly paid — rounded, since paying in parts leaves float dust */}
              <div className="flex justify-between font-semibold"><span>{t('customerOrders.due')}</span><span className="tabular-nums" data-testid="text-amount-due">{round2(amountDue)} {currency}</span></div>
            </div>

            {/* actions: tick what to do, then submit */}
            {(canFulfill || canPay) && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex flex-wrap gap-6">
                  {canFulfill && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={doFulfill} onChange={(e) => setDoFulfill(e.target.checked)} data-testid="check-fulfill" />
                      {unfulfilled.length > 1 ? t('customerOrders.markFulfilledMany', { count: unfulfilled.length }) : t('customerOrders.markFulfilledOne', { count: unfulfilled.length })}
                    </label>
                  )}
                  {canPay && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={doPay} onChange={(e) => setDoPay(e.target.checked)} data-testid="check-pay" />
                      {t('customerOrders.recordPayment')}
                    </label>
                  )}
                </div>

                {/* How much of the balance is being collected. Prefilled with the
                    whole thing, so the common case is still one click. */}
                {canPay && doPay && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        max={dueRounded}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="h-9 w-40 tabular-nums"
                        aria-label={t('customerOrders.amountToPay')}
                        data-testid="input-pay-amount"
                      />
                      <span className="text-sm text-gray-500">{currency}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPayAmount(String(dueRounded))}
                        data-testid="button-pay-full"
                      >
                        {t('customerOrders.payFullBalance')}
                      </Button>
                    </div>
                    {!payAmountValid ? (
                      <p className="text-xs text-red-600" data-testid="text-pay-amount-error">
                        {t('customerOrders.payAmountInvalid', {
                          amount: dueRounded,
                          currency,
                        })}
                      </p>
                    ) : (
                      // what is still owed once this payment lands — the point of
                      // a part payment is knowing what is left
                      <p className="text-xs text-gray-500" data-testid="text-remaining-after">
                        {remainingAfter === 0
                          ? t('customerOrders.settlesOrder')
                          : t('customerOrders.remainingAfter', {
                              amount: remainingAfter as number,
                              currency,
                            })}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={nothingSelected || payBlocked || submitMutation.isPending}
                  className="w-full bg-[#5469D4] hover:bg-[#5469D4]/90"
                  data-testid="button-submit-order-actions"
                >
                  <CheckCircle2 className="h-4 w-4 me-2" />
                  {submitMutation.isPending ? t('customerOrders.submitting') : t('common.submit')}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
