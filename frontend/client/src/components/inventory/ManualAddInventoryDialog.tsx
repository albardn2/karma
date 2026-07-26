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

interface Entity {
  uuid: string;
  name: string;
  sku?: string;
  measure_unit?: string;
}

/**
 * Manually add stock: creates a lot plus its opening quantity in one request.
 *
 * One side is fixed by where it is opened from and the other is picked:
 * pass `warehouseUuid` on a warehouse page (the user picks the material), or
 * `materialUuid` on a material page (the user picks the warehouse).
 */
export function ManualAddInventoryDialog({
  warehouseUuid: fixedWarehouseUuid,
  warehouseName,
  materialUuid: fixedMaterialUuid,
  materialName,
  materialUnit,
}: {
  warehouseUuid?: string;
  warehouseName?: string;
  materialUuid?: string;
  materialName?: string;
  materialUnit?: string;
}) {
  const { t, te } = useLanguage();
  const queryClient = useQueryClient();
  const pickingMaterial = !fixedMaterialUuid;
  const [open, setOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [pickedUuid, setPickedUuid] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [currency, setCurrency] = useState("");
  const [lotId, setLotId] = useState("");
  const [expiration, setExpiration] = useState("");
  const [notes, setNotes] = useState("");

  // only the side that is NOT fixed needs a list to choose from
  const { data: optionsData } = useQuery<any>({
    queryKey: [pickingMaterial ? "/material/" : "/warehouse/", "for-manual-add"],
    queryFn: () =>
      apiRequest(
        pickingMaterial ? "/material/?per_page=100" : "/warehouse/?per_page=100"
      ),
    enabled: open,
  });
  const options: Entity[] = pickingMaterial
    ? optionsData?.materials ?? []
    : optionsData?.warehouses ?? [];
  const picked = useMemo(
    () => options.find((o) => o.uuid === pickedUuid),
    [options, pickedUuid]
  );

  // the unit always comes from the material, never from a free choice
  const unit = pickingMaterial ? picked?.measure_unit : materialUnit;

  const filteredOptions = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name?.toLowerCase().includes(q) || o.sku?.toLowerCase().includes(q)
    );
  }, [options, materialSearch]);

  const reset = () => {
    setMaterialSearch("");
    setPickedUuid("");
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
  const canSubmit = !!pickedUuid && qtyValid && costValid;

  const materialUuidToSend = pickingMaterial ? pickedUuid : fixedMaterialUuid!;
  const warehouseUuidToSend = pickingMaterial ? fixedWarehouseUuid! : pickedUuid;

  const addStock = useMutation({
    mutationFn: () =>
      apiRequest("/inventory/manual-add", {
        method: "POST",
        body: {
          material_uuid: materialUuidToSend,
          warehouse_uuid: warehouseUuidToSend,
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
      // the warehouse stock table + chart are keyed under "/inventory/", and
      // the material page's own inventory summary under "/material/" — without
      // the latter the material page keeps showing pre-add quantities for the
      // whole staleTime
      queryClient.invalidateQueries({ queryKey: ["/inventory/"] });
      queryClient.invalidateQueries({ queryKey: ["/inventory-event/"] });
      queryClient.invalidateQueries({ queryKey: ["/material/"] });
      toast({
        title: t("warehouses.stockAdded"),
        description: `${qtyNumber} ${unit ?? ""} · ${
          pickingMaterial ? picked?.name ?? "" : materialName ?? ""
        }${pickingMaterial ? "" : ` → ${picked?.name ?? ""}`}`,
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
            {pickingMaterial
              ? warehouseName
                ? ` — ${warehouseName}`
                : ""
              : materialName
              ? ` — ${materialName}`
              : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* The fixed side is shown read-only so it is obvious what stock is
              being added to; the other side is picked here.

              A plain inline dropdown, matching AddInventoryDialog: a Radix
              Popover/Command would be unreachable, since the Dialog traps focus
              and blocks pointer events on portalled content. */}
          <div className="space-y-1.5">
            <Label>
              {pickingMaterial ? t("materials.materialName") : t("inventory.warehouse")} *
            </Label>
            <div className="relative">
              <Button
                variant="outline"
                type="button"
                className="w-full justify-between font-normal"
                onClick={() => setMaterialOpen((o) => !o)}
                data-testid="material-combobox"
              >
                <span className={picked ? "" : "text-gray-500"}>
                  {picked
                    ? picked.name
                    : pickingMaterial
                    ? t("inventory.searchMaterials")
                    : t("inventory.searchWarehouses")}
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
                      placeholder={
                        pickingMaterial
                          ? t("inventory.searchMaterials")
                          : t("inventory.searchWarehouses")
                      }
                      data-testid="material-search"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto pb-1">
                    {filteredOptions.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">
                        {t("common.noResults")}
                      </p>
                    ) : (
                      filteredOptions.map((o) => (
                        <div
                          key={o.uuid}
                          role="option"
                          aria-selected={pickedUuid === o.uuid}
                          className="flex items-center px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setPickedUuid(o.uuid);
                            setMaterialOpen(false);
                            setMaterialSearch("");
                          }}
                          data-testid={`material-option-${o.uuid}`}
                        >
                          <Check
                            className={cn(
                              "me-2 h-4 w-4 shrink-0",
                              pickedUuid === o.uuid ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{o.name}</span>
                          {o.measure_unit && (
                            <span className="ms-auto ps-2 text-xs text-gray-400">
                              {te(o.measure_unit)}
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

          {/* the fixed side, read-only */}
          {!pickingMaterial && (
            <div className="space-y-1.5">
              <Label>{t("materials.materialName")}</Label>
              <p
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                data-testid="fixed-material"
              >
                {materialName ?? "—"}
                {materialUnit && (
                  <span className="ms-2 text-xs text-gray-500">{te(materialUnit)}</span>
                )}
              </p>
            </div>
          )}

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
                {unit ? te(unit) : "—"}
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
