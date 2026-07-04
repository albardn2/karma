import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Crosshair } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CustomerRow {
  uuid: string;
  company_name?: string;
  full_name?: string;
  phone_number?: string;
  coordinates?: string | null;
}

export function AddStopDialog({
  workflowExecutionUuid,
  onCreated,
}: {
  workflowExecutionUuid: string;
  onCreated?: (taskExecutionUuid: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [customerUuid, setCustomerUuid] = useState("");
  // "lat,lon" — captured from device location, used when the customer has no stored coordinates
  const [coords, setCoords] = useState("");
  const [newCustomer, setNewCustomer] = useState({
    company_name: "",
    full_name: "",
    phone_number: "",
    category: "",
    full_address: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // debounce the search text, then filter server-side (company_name ilike)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: customersData } = useQuery({
    queryKey: ["/customer/", "add-stop", debouncedSearch],
    queryFn: async () =>
      apiRequest(
        `/customer/?page=1&per_page=100${debouncedSearch ? `&company_name=${encodeURIComponent(debouncedSearch)}` : ""}`
      ),
    enabled: isOpen && mode === "existing",
  });
  const customers: CustomerRow[] = customersData?.customers || [];
  const filtered = customers;

  const { data: categories } = useQuery<string[]>({
    queryKey: ["/customer/categories"],
    queryFn: async () => apiRequest("/customer/categories"),
    enabled: isOpen && mode === "new",
  });

  // try to capture the device location once when the dialog opens
  useEffect(() => {
    if (isOpen && !coords && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
        () => {}, // ignore errors; the user can type coordinates manually
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location unavailable", description: "Geolocation is not supported here.", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`),
      (e) => toast({ title: "Location error", description: e.message, variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const reset = () => {
    setMode("existing");
    setSearch("");
    setCustomerUuid("");
    setNewCustomer({ company_name: "", full_name: "", phone_number: "", category: "", full_address: "" });
  };

  const addStop = useMutation({
    mutationFn: async () => {
      const body: any = { coordinates: coords || null };
      if (mode === "existing") {
        body.customer_uuid = customerUuid;
      } else {
        body.customer = {
          company_name: newCustomer.company_name,
          full_name: newCustomer.full_name,
          phone_number: newCustomer.phone_number,
          category: newCustomer.category,
          full_address: newCustomer.full_address || newCustomer.company_name,
          coordinates: coords || null,
        };
      }
      return apiRequest(`/workflow-execution/${workflowExecutionUuid}/manual-stop`, { method: "POST", body });
    },
    onSuccess: (res: any) => {
      toast({ title: "Stop added", description: "The trip stop was created." });
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/", workflowExecutionUuid] });
      queryClient.invalidateQueries({ queryKey: ["/customer/"] });
      reset();
      setIsOpen(false);
      if (res?.task_execution_uuid && onCreated) onCreated(res.task_execution_uuid);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit =
    mode === "existing"
      ? !!customerUuid
      : !!(newCustomer.company_name && newCustomer.full_name && newCustomer.phone_number && newCustomer.category);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-add-stop">
          <MapPin className="h-4 w-4 mr-2" />
          Add Stop
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Stop</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* mode toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "existing" ? "default" : "outline"}
              onClick={() => setMode("existing")}
              data-testid="mode-existing-customer"
            >
              Existing customer
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode("new")}
              data-testid="mode-new-customer"
            >
              <Plus className="h-4 w-4 mr-1" />
              New customer
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-customer-search"
              />
              <div className="border rounded-md divide-y max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="text-sm text-gray-500 p-3">No customers match.</div>
                ) : (
                  filtered.map((c) => (
                    <div
                      key={c.uuid}
                      role="button"
                      onClick={() => setCustomerUuid(c.uuid)}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${customerUuid === c.uuid ? "bg-blue-50" : ""}`}
                      data-testid={`customer-option-${c.uuid}`}
                    >
                      <div className="font-medium">{c.company_name || c.full_name}</div>
                      <div className="text-gray-500 text-xs">{c.full_name} {c.phone_number ? `· ${c.phone_number}` : ""}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input placeholder="Company / shop name *" value={newCustomer.company_name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, company_name: e.target.value }))}
                data-testid="input-new-company" />
              <Input placeholder="Contact full name *" value={newCustomer.full_name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, full_name: e.target.value }))}
                data-testid="input-new-fullname" />
              <Input placeholder="Phone number *" value={newCustomer.phone_number}
                onChange={(e) => setNewCustomer((p) => ({ ...p, phone_number: e.target.value }))}
                data-testid="input-new-phone" />
              <Select value={newCustomer.category} onValueChange={(v) => setNewCustomer((p) => ({ ...p, category: v }))}>
                <SelectTrigger data-testid="select-new-category">
                  <SelectValue placeholder="Category *" />
                </SelectTrigger>
                <SelectContent>
                  {(categories || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Address (optional)" value={newCustomer.full_address}
                onChange={(e) => setNewCustomer((p) => ({ ...p, full_address: e.target.value }))}
                data-testid="input-new-address" />
            </div>
          )}

          {/* location (used when the customer has no stored coordinates) */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Location (lat,lon) — used if the customer has no saved location
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 33.5138,36.2765"
                value={coords}
                onChange={(e) => setCoords(e.target.value)}
                data-testid="input-stop-coords"
              />
              <Button type="button" variant="outline" size="icon" onClick={captureLocation} title="Use my location">
                <Crosshair className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button
            className="w-full bg-[#5469D4] hover:bg-[#5469D4]/90"
            onClick={() => addStop.mutate()}
            disabled={!canSubmit || addStop.isPending}
            data-testid="button-submit-add-stop"
          >
            {addStop.isPending ? "Adding…" : "Add Stop"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
