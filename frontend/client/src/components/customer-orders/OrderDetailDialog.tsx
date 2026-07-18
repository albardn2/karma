import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const canPay = amountDue > 0;

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
      if (doPay && canPay) {
        await apiRequest("/payment/", {
          method: "POST",
          body: {
            invoice_uuid: invoice.uuid,
            financial_account_uuid: null, // default account (by currency) on the backend
            amount: amountDue,
            currency,
            payment_method: "cash", // default method
            trip_stop_uuid: tripStopUuid || null, // attribute cash to the current trip stop
          },
        });
      }
    },
    onSuccess: () => {
      toast({ title: t('customerOrders.orderUpdated'), description: t('customerOrders.orderUpdatedDesc') });
      refresh();
    },
    onError: (e: Error) => toast({ title: t('common.error'), description: e.message, variant: "destructive" }),
  });

  const nothingSelected = !(doFulfill && canFulfill) && !(doPay && canPay);

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
              <div className="flex justify-between"><span className="text-gray-500">{t('common.total')}</span><span>{invoice?.total_amount ?? order.total_adjusted_amount ?? 0} {currency}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('customerOrders.paid')}</span><span>{invoice?.net_amount_paid ?? order.net_amount_paid ?? 0} {currency}</span></div>
              <div className="flex justify-between font-semibold"><span>{t('customerOrders.due')}</span><span>{amountDue} {currency}</span></div>
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
                      {t('customerOrders.markPaidAmount', { amount: amountDue, currency })}
                    </label>
                  )}
                </div>

                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={nothingSelected || submitMutation.isPending}
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
