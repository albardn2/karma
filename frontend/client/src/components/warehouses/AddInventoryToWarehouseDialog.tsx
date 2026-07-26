import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "SYP", "EUR", "TRY"];

interface Material {
  uuid: string;
  name: string;
  sku?: string;
  measure_unit?: string;
}

export function AddInventoryToWarehouseDialog({
  warehouseUuid,
  warehouseName,
}: {
  warehouseUuid: string;
  warehouseName?: string;
}) {
  const { t, te } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialUuid, setMaterialUuid] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [currency, setCurrency] = useState("");
  const [lotId, setLotId] = useState("");
  const [expiration, setExpiration] = useState("");
  const [notes, setNotes] = useState("");

  const { data: materialsData } = useQuery<any>({
    queryKey: ["/material/", "for-manual-add"],
    queryFn: () => apiRequest("/material/?per_page=100"),
    enabled: open,
  });
  const materials: Material[] = materialsData?.materials ?? [];
  const selected = useMemo(
    () => materials.find((m) => m.uuid === materialUuid),
    [materials, materialUuid]
  );

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q)
    );
  }, [materials, materialSearch]);

  const reset = () => {
    setMaterialSearch("");
    setMaterialUuid("");
    setQuantity("");
    setCostPerUnit("");
    setCurrency("");
    setLotId("");
    setExpiration("");
    setNotes("");
  };

  const qtyNumber = Number(quantity);
  const qtyValid = quantity !== "" && Number.isFinite(qtyNumber) && qtyNumber > 0;
  // the backend rejects a cost without a currency, so mirror that here
  const costValid = costPerUnit === "" || currency !== "";
  const canSubmit = !!materialUuid && qtyValid && costValid;

  const addStock = useMutation({
    mutationFn: () =>
      apiRequest("/inventory/manual-add", {
        method: "POST",
        body: {
          material_uuid: materialUuid,
          warehouse_uuid: warehouseUuid,
          quantity: qtyNumber,
          ...(notes ? { notes } : {}),
          ...(lotId ? { lot_id: lotId } : {}),
          ...(expiration ? { expiration_date: `${expiration}T00:00:00` } : {}),
          ...(costPerUnit !== ""
            ? { cost_per_unit: Number(costPerUnit), currency }
            : {}),
        },
      }),
    onSuccess: () => {
      // the warehouse stock table + chart are keyed under "/inventory/"
      queryClient.invalidateQueries({ queryKey: ["/inventory/"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/"] });
      toast({
        title: t("warehouses.stockAdded"),
        description: `${qtyNumber} ${selected?.measure_unit ?? ""} · ${
          selected?.name ?? ""
        }`,
      });
      reset();
      setOpen(false);
    },
    onError: (e: any) =>
      toast({
        title: t("warehouses.addStockFailed"),
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
        <Button size="sm" className="brand-gradient gap-1" data-testid="add-inventory-button">
          <Plus className="h-4 w-4" />
          {t("warehouses.addInventory")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("warehouses.addInventory")}
            {warehouseName ? ` — ${warehouseName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* material — a plain inline dropdown, matching AddInventoryDialog.
              A Radix Popover/Command here would be unreachable: the Dialog
              traps focus and blocks pointer events on portalled content. */}
          <div className="space-y-1.5">
            <Label>{t("materials.materialName")} *</Label>
            <div className="relative">
              <Button
                variant="outline"
                type="button"
                className="w-full justify-between font-normal"
                onClick={() => setMaterialOpen((o) => !o)}
                data-testid="material-combobox"
              >
                <span className={selected ? "" : "text-gray-500"}>
                  {selected ? selected.name : t("inventory.searchMaterials")}
                </span>
                <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
              {materialOpen && (
                <div className="absolute z-50 w-full mt-1 rounded-md border border-gray-200 bg-white shadow-lg">
                  <div className="p-2">
                    <Input
                      autoFocus
                      value={materialSearch}
                      onChange={(e) => setMaterialSearch(e.target.value)}
                      placeholder={t("inventory.searchMaterials")}
                      data-testid="material-search"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto pb-1">
                    {filteredMaterials.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">
                        {t("common.noResults")}
                      </p>
                    ) : (
                      filteredMaterials.map((m) => (
                        <div
                          key={m.uuid}
                          role="option"
                          aria-selected={materialUuid === m.uuid}
                          className="flex items-center px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setMaterialUuid(m.uuid);
                            setMaterialOpen(false);
                            setMaterialSearch("");
                          }}
                          data-testid={`material-option-${m.uuid}`}
                        >
                          <Check
                            className={cn(
                              "me-2 h-4 w-4 shrink-0",
                              materialUuid === m.uuid ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{m.name}</span>
                          {m.measure_unit && (
                            <span className="ms-auto ps-2 text-xs text-gray-400">
                              {te(m.measure_unit)}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* quantity — unit comes from the material, it is not a free choice */}
          <div className="space-y-1.5">
            <Label>{t("warehouses.quantity")} *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                data-testid="quantity-input"
              />
              <span className="text-sm text-gray-500 whitespace-nowrap min-w-14">
                {selected?.measure_unit ? te(selected.measure_unit) : "—"}
              </span>
            </div>
            {quantity !== "" && !qtyValid && (
              <p className="text-xs text-red-600">{t("warehouses.quantityPositive")}</p>
            )}
          </div>

          {/* optional cost */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("warehouses.costPerUnitOptional")}</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                placeholder="0.00"
                data-testid="cost-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="currency-select">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {te(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!costValid && (
                <p className="text-xs text-red-600">
                  {t("warehouses.currencyRequiredWithCost")}
                </p>
              )}
            </div>
          </div>

          {/* optional lot + expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("inventory.lotIdOptional")}</Label>
              <Input
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                placeholder={t("warehouses.lotAutoGenerated")}
                data-testid="lot-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("inventory.expirationDateOptional")}</Label>
              <Input
                type="date"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                data-testid="expiration-input"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("inventory.notesOptional")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("inventory.enterNotes")}
              rows={2}
              data-testid="notes-input"
            />
          </div>

          <p className="text-xs text-gray-500">{t("warehouses.manualAddNote")}</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            className="brand-gradient"
            disabled={!canSubmit || addStock.isPending}
            onClick={() => addStock.mutate()}
            data-testid="submit-add-inventory"
          >
            {addStock.isPending ? t("common.loading") : t("warehouses.addInventory")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
