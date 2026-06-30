import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { OrderDetailDialog } from "@/components/customer-orders/OrderDetailDialog";

interface OrderRow {
  uuid: string;
  created_at: string;
  is_paid?: boolean;
  is_fulfilled?: boolean;
  net_amount_due?: number;
  total_adjusted_amount?: number;
  currency?: string;
}

export function CustomerRecentOrders({ customerUuid }: { customerUuid: string }) {
  const [selectedOrderUuid, setSelectedOrderUuid] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["/customer-order/", "recent", customerUuid],
    queryFn: async () => apiRequest(`/customer-order/?customer_uuid=${customerUuid}&per_page=50`),
    enabled: !!customerUuid,
  });

  const { data: customer } = useQuery({
    queryKey: ["/customer/", customerUuid],
    queryFn: async () => apiRequest(`/customer/${customerUuid}`),
    enabled: !!customerUuid,
  });
  const balances: Record<string, number> = customer?.balance_per_currency || {};

  const all: OrderRow[] = data?.orders || data?.customer_orders || [];
  const needsAttention = (o: OrderRow) => o.is_paid === false || o.is_fulfilled === false;

  // unpaid/unfulfilled first, then most recent; show the last 5
  const orders = [...all]
    .sort((a, b) => {
      const ap = needsAttention(a) ? 0 : 1;
      const bp = needsAttention(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 5);

  const fmtDate = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString();
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Recent orders</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Balance</span>
            {Object.keys(balances).length === 0 ? (
              <span className="text-sm text-gray-400">—</span>
            ) : (
              Object.entries(balances).map(([cur, amt]) => (
                <Badge key={cur} variant={Number(amt) > 0 ? "destructive" : "secondary"} data-testid={`balance-${cur}`}>
                  {Number(amt).toFixed(2)} {cur}
                </Badge>
              ))
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-gray-500">No previous orders for this customer.</div>
        ) : (
          <div className="divide-y">
            {orders.map((o) => (
              <div
                key={o.uuid}
                role="button"
                onClick={() => setSelectedOrderUuid(o.uuid)}
                className="flex items-center justify-between py-2 px-1 rounded cursor-pointer hover:bg-gray-50"
                data-testid={`recent-order-${o.uuid}`}
              >
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{fmtDate(o.created_at)}</div>
                  <div className="text-gray-500">
                    {(o.net_amount_due ?? o.total_adjusted_amount ?? 0)} {o.currency || ""} due
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant={o.is_paid ? "secondary" : "destructive"}>
                    {o.is_paid ? "Paid" : "Unpaid"}
                  </Badge>
                  <Badge variant={o.is_fulfilled ? "secondary" : "outline"}>
                    {o.is_fulfilled ? "Fulfilled" : "Unfulfilled"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <OrderDetailDialog
        orderUuid={selectedOrderUuid}
        open={!!selectedOrderUuid}
        onOpenChange={(o) => { if (!o) setSelectedOrderUuid(null); }}
      />
    </Card>
  );
}
