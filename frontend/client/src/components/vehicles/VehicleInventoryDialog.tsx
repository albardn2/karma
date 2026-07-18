import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Boxes, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VehicleInventory {
  uuid: string;
  material_uuid: string;
  material_name?: string | null;
  unit?: string | null;
  current_quantity?: number | null;
}

const EVENT_TYPES = [
  { value: "manual", labelKey: "vehicles.eventAddManual" },
  { value: "adjustment", labelKey: "vehicles.eventAdjust" },
  { value: "unload", labelKey: "vehicles.eventUnload" },
];

function InventoryRow({
  inv,
  onApply,
  isPending,
}: {
  inv: VehicleInventory;
  onApply: (eventType: string, quantity: number) => void;
  isPending: boolean;
}) {
  const { t } = useLanguage();
  const [eventType, setEventType] = useState("manual");
  const [qty, setQty] = useState("");

  const apply = () => {
    const n = parseFloat(qty);
    if (!isNaN(n) && n !== 0) {
      onApply(eventType, n);
      setQty("");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border rounded-md p-3">
      <div className="min-w-0">
        <div className="font-medium truncate" data-testid={`text-vinv-material-${inv.uuid}`}>
          {inv.material_name || inv.material_uuid}
        </div>
        <div className="text-sm text-gray-500">
          {t("vehicles.onHand")}: <span className="font-semibold">{inv.current_quantity ?? 0}</span> {inv.unit || ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((et) => (
              <SelectItem key={et.value} value={et.value}>
                {t(et.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="any"
          placeholder={t("vehicles.qty")}
          className="w-24"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Button size="sm" disabled={isPending || !qty} onClick={apply}>
          {t("common.apply")}
        </Button>
      </div>
    </div>
  );
}

export function VehicleInventoryDialog({ vehicleUuid }: { vehicleUuid: string }) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [materialUuid, setMaterialUuid] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invKey = ["/vehicle-inventory/", vehicleUuid];

  const { data: invData, isLoading } = useQuery({
    queryKey: invKey,
    queryFn: async () =>
      apiRequest(`/vehicle-inventory/?vehicle_uuid=${vehicleUuid}&per_page=100`),
    enabled: isOpen,
  });
  const inventories: VehicleInventory[] = invData?.vehicle_inventories || [];

  const { data: materialsData } = useQuery({
    queryKey: ["/material/", "vehicle-inventory"],
    queryFn: async () => apiRequest(`/material/?page=1&per_page=100`),
    enabled: isOpen,
  });
  const materials = materialsData?.materials || [];

  const refresh = () => {
    // prefix-matches the dialog list, the Current Inventory table, and the
    // chart's inventory query (["/vehicle-inventory/", vehicleUuid, ...])
    queryClient.invalidateQueries({ queryKey: invKey });
    queryClient.refetchQueries({ queryKey: invKey });
    // the chart's line data lives under its own key — without this the chart
    // doesn't move until a full page reload
    queryClient.invalidateQueries({ queryKey: ["/vehicle-inventory-event/series"] });
  };

  const createInventory = useMutation({
    mutationFn: async () =>
      apiRequest("/vehicle-inventory/", {
        method: "POST",
        body: { vehicle_uuid: vehicleUuid, material_uuid: materialUuid },
      }),
    onSuccess: () => {
      toast({ title: t("vehicles.materialAddedTitle"), description: t("vehicles.materialAddedDesc") });
      setMaterialUuid("");
      refresh();
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const createEvent = useMutation({
    mutationFn: async (vars: { vehicle_inventory_uuid: string; event_type: string; quantity: number }) =>
      apiRequest("/vehicle-inventory-event/", { method: "POST", body: vars }),
    onSuccess: () => {
      toast({ title: t("vehicles.stockUpdatedTitle"), description: t("vehicles.stockUpdatedDesc") });
      refresh();
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-vehicle-inventory">
          <Boxes className="h-4 w-4 me-2" />
          {t("nav.inventory")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("vehicles.vehicleInventory")}</DialogTitle>
        </DialogHeader>

        {/* Add a material to this vehicle */}
        <div className="flex items-end gap-2 border-b pb-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">{t("vehicles.addMaterial")}</label>
            <Select value={materialUuid} onValueChange={setMaterialUuid}>
              <SelectTrigger data-testid="select-vinv-material">
                <SelectValue placeholder={t("vehicles.selectMaterial")} />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m: any) => (
                  <SelectItem key={m.uuid} value={m.uuid}>
                    {m.name}
                    {m.sku ? ` (${m.sku})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => createInventory.mutate()}
            disabled={!materialUuid || createInventory.isPending}
            data-testid="button-add-vinv"
          >
            <Plus className="h-4 w-4 me-1" />
            {t("common.add")}
          </Button>
        </div>

        {/* Current stock + add/adjust/unload */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="text-sm text-gray-500 py-6 text-center">{t("common.loading")}</div>
          ) : inventories.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">
              {t("vehicles.noInventoryAddHint")}
            </div>
          ) : (
            inventories.map((inv) => (
              <InventoryRow
                key={inv.uuid}
                inv={inv}
                isPending={createEvent.isPending}
                onApply={(event_type, quantity) =>
                  createEvent.mutate({ vehicle_inventory_uuid: inv.uuid, event_type, quantity })
                }
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
