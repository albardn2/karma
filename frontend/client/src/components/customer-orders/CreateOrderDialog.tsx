import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LineItem {
  material_uuid: string;
  quantity: string;
  price_per_unit: string;
}

const CURRENCIES = ["USD", "SYP"];

export function CreateOrderDialog({
  customerUuid,
  customerName,
  tripStopUuid,
}: {
  customerUuid: string;
  customerName?: string;
  tripStopUuid?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<LineItem[]>([{ material_uuid: "", quantity: "", price_per_unit: "" }]);
  const [currency, setCurrency] = useState("USD");
  const [markFulfilled, setMarkFulfilled] = useState(true);
  const [markPaid, setMarkPaid] = useState(true);
  const [financialAccountUuid, setFinancialAccountUuid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: materialsData } = useQuery({
    queryKey: ["/material/", "create-order"],
    queryFn: async () => apiRequest("/material/?page=1&per_page=100"),
    enabled: isOpen,
  });
  const materials = materialsData?.materials || [];

  const { data: accountsData } = useQuery({
    queryKey: ["/financial-account/", "create-order"],
    queryFn: async () => apiRequest("/financial-account/?page=1&per_page=100"),
    enabled: isOpen && markPaid,
  });
  const accounts = accountsData?.accounts || [];

  const { data: methodsData } = useQuery({
    queryKey: ["/payment/payment-methods"],
    queryFn: async () => apiRequest("/payment/payment-methods"),
    enabled: isOpen && markPaid,
  });
  const methods: string[] = methodsData || ["cash"];

  const total = items.reduce(
    (sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.price_per_unit) || 0),
    0
  );

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { material_uuid: "", quantity: "", price_per_unit: "" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const reset = () => {
    setItems([{ material_uuid: "", quantity: "", price_per_unit: "" }]);
    setCurrency("USD");
    setMarkFulfilled(true);
    setMarkPaid(true);
    setFinancialAccountUuid("");
    setPaymentMethod("cash");
  };

  const createOrder = useMutation({
    mutationFn: async () => {
      const body: any = {
        customer_uuid: customerUuid,
        currency,
        trip_stop_uuid: tripStopUuid || null,
        items: items.map((it) => ({
          material_uuid: it.material_uuid,
          quantity: parseInt(it.quantity, 10),
          price_per_unit: parseFloat(it.price_per_unit),
        })),
        fulfill: markFulfilled,
        pay: markPaid,
      };
      if (markPaid) {
        body.financial_account_uuid = financialAccountUuid || null;
        body.payment_method = paymentMethod;
      }
      return apiRequest("/customer-order/with-items-and-invoice/checkout", { method: "POST", body });
    },
    onSuccess: () => {
      toast({ title: "Order created", description: "The order was created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/customer-order/"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/"] }); // refresh customer balance
      queryClient.invalidateQueries({ queryKey: ["/trip-stop/"] });
      reset();
      setIsOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const validItems = items.filter((it) => it.material_uuid && parseInt(it.quantity, 10) > 0);
  const canSubmit =
    validItems.length > 0 &&
    items.every((it) => !it.material_uuid || (parseInt(it.quantity, 10) > 0 && it.price_per_unit !== "")) &&
    (!markPaid || true);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-order" className="bg-[#5469D4] hover:bg-[#5469D4]/90">
          <ShoppingCart className="h-4 w-4 mr-2" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Order{customerName ? ` — ${customerName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* currency */}
          <div className="flex items-end gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm text-gray-500">Total</div>
              <div className="text-lg font-semibold">{total.toFixed(2)} {currency}</div>
            </div>
          </div>

          {/* line items */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Items</label>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={it.material_uuid} onValueChange={(v) => setItem(i, { material_uuid: v })}>
                  <SelectTrigger className="flex-1" data-testid={`select-material-${i}`}>
                    <SelectValue placeholder="Select material..." />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m: any) => (
                      <SelectItem key={m.uuid} value={m.uuid}>{m.name}{m.sku ? ` (${m.sku})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="1" step="1" placeholder="Qty" className="w-20"
                  value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
                <Input type="number" min="0" step="any" placeholder="Price" className="w-24"
                  value={it.price_per_unit} onChange={(e) => setItem(i, { price_per_unit: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} disabled={items.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Add item
            </Button>
          </div>

          {/* toggles */}
          <div className="flex flex-wrap gap-6 border-t pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={markFulfilled} onChange={(e) => setMarkFulfilled(e.target.checked)} data-testid="toggle-fulfilled" />
              Mark fulfilled
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} data-testid="toggle-paid" />
              Mark paid
            </label>
          </div>

          {/* payment fields */}
          {markPaid && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Financial account</label>
                <Select value={financialAccountUuid} onValueChange={setFinancialAccountUuid}>
                  <SelectTrigger data-testid="select-account"><SelectValue placeholder="Default (by currency)" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.uuid} value={a.uuid}>{a.account_name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Payment method</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger data-testid="select-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createOrder.mutate()}
              disabled={!canSubmit || createOrder.isPending}
              className="bg-[#5469D4] hover:bg-[#5469D4]/90"
            >
              {createOrder.isPending ? "Submitting..." : "Submit Order"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
