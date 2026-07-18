import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import type { WarehouseFilters } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

interface WarehouseFiltersComponentProps {
  filters: WarehouseFilters;
  onFiltersChange: (filters: WarehouseFilters) => void;
}

export function WarehouseFiltersComponent({ filters, onFiltersChange }: WarehouseFiltersComponentProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<WarehouseFilters>(filters);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = { page: 1, per_page: localFilters.per_page || 20 };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setOpen(false);
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof WarehouseFilters]
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          {t('common.filters')}
          {hasActiveFilters && (
            <span className="ms-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof WarehouseFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('warehouses.filterWarehouses')}</SheetTitle>
          <SheetDescription>
            {t('warehouses.filterDescription')}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="uuid">{t('warehouses.uuid')}</Label>
            <Input
              id="uuid"
              placeholder={t('warehouses.searchByUuid')}
              value={localFilters.uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">{t('warehouses.warehouseName')}</Label>
            <Input
              id="name"
              placeholder={t('warehouses.searchByName')}
              value={localFilters.name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="per_page">{t('warehouses.itemsPerPage')}</Label>
            <Select
              value={localFilters.per_page?.toString() || "20"}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('warehouses.itemsPerPage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{t('warehouses.perPageOption', { count: 10 })}</SelectItem>
                <SelectItem value="20">{t('warehouses.perPageOption', { count: 20 })}</SelectItem>
                <SelectItem value="50">{t('warehouses.perPageOption', { count: 50 })}</SelectItem>
                <SelectItem value="100">{t('warehouses.perPageOption', { count: 100 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleApplyFilters} className="flex-1">
              {t('warehouses.applyFilters')}
            </Button>
            <Button onClick={handleClearFilters} variant="outline" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { WarehouseFilters };