import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { VehicleStatus, type VehicleFilters } from "@/lib/types";

interface VehicleFiltersComponentProps {
  filters: VehicleFilters;
  onFiltersChange: (filters: VehicleFilters) => void;
  onClearFilters: () => void;
}

export function VehicleFiltersComponent({ filters, onFiltersChange, onClearFilters }: VehicleFiltersComponentProps) {
  const { t, te } = useLanguage();
  const [localFilters, setLocalFilters] = useState<VehicleFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onFiltersChange({ ...localFilters, page: 1 });
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: VehicleFilters = { page: 1, per_page: filters.per_page };
    setLocalFilters(clearedFilters);
    onClearFilters();
    setIsOpen(false);
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof VehicleFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative" data-testid="button-filters">
          <Filter className="h-4 w-4" />
          {t("common.filters")}
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-2 py-1 ms-2">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof VehicleFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>{t("vehicles.filterVehicles")}</SheetTitle>
          <SheetDescription>
            {t("vehicles.filterDescription")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="plate_number">{t("vehicles.plateNumber")}</Label>
            <Input
              id="plate_number"
              value={localFilters.plate_number || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, plate_number: e.target.value })}
              placeholder={t("vehicles.searchByPlate")}
              data-testid="input-filter-plate"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="make">{t("vehicles.make")}</Label>
            <Input
              id="make"
              value={localFilters.make || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, make: e.target.value })}
              placeholder={t("vehicles.searchByMake")}
              data-testid="input-filter-make"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">{t("vehicles.model")}</Label>
            <Input
              id="model"
              value={localFilters.model || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, model: e.target.value })}
              placeholder={t("vehicles.searchByModel")}
              data-testid="input-filter-model"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="year">{t("vehicles.year")}</Label>
            <Input
              id="year"
              type="number"
              value={localFilters.year || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, year: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder={t("vehicles.searchByYear")}
              data-testid="input-filter-year"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">{t("vehicles.color")}</Label>
            <Input
              id="color"
              value={localFilters.color || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, color: e.target.value })}
              placeholder={t("vehicles.searchByColor")}
              data-testid="input-filter-color"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">{t("common.status")}</Label>
            <Select
              value={localFilters.status || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, status: value === "all" ? undefined : value as VehicleStatus })}
            >
              <SelectTrigger data-testid="select-filter-status">
                <SelectValue placeholder={t("vehicles.selectStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("vehicles.allStatuses")}</SelectItem>
                <SelectItem value={VehicleStatus.ACTIVE}>{te(VehicleStatus.ACTIVE)}</SelectItem>
                <SelectItem value={VehicleStatus.INACTIVE}>{te(VehicleStatus.INACTIVE)}</SelectItem>
                <SelectItem value={VehicleStatus.SOLD}>{te(VehicleStatus.SOLD)}</SelectItem>
                <SelectItem value={VehicleStatus.MAINTENANCE}>{te(VehicleStatus.MAINTENANCE)}</SelectItem>
                <SelectItem value={VehicleStatus.RETIRED}>{te(VehicleStatus.RETIRED)}</SelectItem>
                <SelectItem value={VehicleStatus.UTILIZED}>{te(VehicleStatus.UTILIZED)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vin">{t("vehicles.vin")}</Label>
            <Input
              id="vin"
              value={localFilters.vin || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, vin: e.target.value })}
              placeholder={t("vehicles.searchByVin")}
              data-testid="input-filter-vin"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="per_page">{t("vehicles.itemsPerPage")}</Label>
            <Select
              value={localFilters.per_page?.toString() || "12"}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger data-testid="select-filter-per-page">
                <SelectValue placeholder={t("vehicles.itemsPerPage")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{t("vehicles.perPageOption", { count: 10 })}</SelectItem>
                <SelectItem value="12">{t("vehicles.perPageOption", { count: 12 })}</SelectItem>
                <SelectItem value="20">{t("vehicles.perPageOption", { count: 20 })}</SelectItem>
                <SelectItem value="50">{t("vehicles.perPageOption", { count: 50 })}</SelectItem>
                <SelectItem value="100">{t("vehicles.perPageOption", { count: 100 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleApply} className="flex-1" data-testid="button-apply-filters">
              {t("vehicles.applyFilters")}
            </Button>
            <Button onClick={handleClear} variant="outline" className="flex-1" data-testid="button-clear-filters">
              {t("common.clearFilters")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { VehicleFilters };
