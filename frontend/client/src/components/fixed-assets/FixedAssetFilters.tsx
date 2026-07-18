import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface FixedAssetFilters {
  uuid?: string;
  name?: string;
  purchase_order_item_uuid?: string;
  material_uuid?: string;
}

interface FixedAssetFiltersProps {
  filters: FixedAssetFilters;
  onFiltersChange: (filters: FixedAssetFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function FixedAssetFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: FixedAssetFiltersProps) {
  const { t } = useLanguage();
  const [localFilters, setLocalFilters] = useState<FixedAssetFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: FixedAssetFilters = {
      uuid: "",
      name: "",
      purchase_order_item_uuid: "",
      material_uuid: "",
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(filters).some(value => value && value !== "");

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="h-4 w-4 me-2" />
          {t('common.filters')}
          {hasActiveFilters && (
            <span className="absolute -top-1 -end-1 h-3 w-3 bg-[#5469D4] rounded-full"></span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>{t('fixedAssets.filterTitle')}</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="uuid">{t('fixedAssets.uuid')}</Label>
                <Input
                  id="uuid"
                  placeholder={t('fixedAssets.filterByUuid')}
                  value={localFilters.uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('common.name')}</Label>
                <Input
                  id="name"
                  placeholder={t('fixedAssets.filterByName')}
                  value={localFilters.name || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_order_item_uuid">{t('fixedAssets.purchaseOrderItemUuid')}</Label>
                <Input
                  id="purchase_order_item_uuid"
                  placeholder={t('fixedAssets.filterByPurchaseOrderItemUuid')}
                  value={localFilters.purchase_order_item_uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, purchase_order_item_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material_uuid">{t('fixedAssets.materialUuid')}</Label>
                <Input
                  id="material_uuid"
                  placeholder={t('fixedAssets.filterByMaterialUuid')}
                  value={localFilters.material_uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, material_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="per_page">{t('fixedAssets.itemsPerPage')}</Label>
                <Select
                  value={perPage.toString()}
                  onValueChange={(value) => onPerPageChange(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('fixedAssets.selectItemsPerPage')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">{t('fixedAssets.perPageOption', { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t('fixedAssets.perPageOption', { count: 20 })}</SelectItem>
                    <SelectItem value="50">{t('fixedAssets.perPageOption', { count: 50 })}</SelectItem>
                    <SelectItem value="100">{t('fixedAssets.perPageOption', { count: 100 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-6 border-t">
            <Button onClick={handleApplyFilters} className="w-full bg-[#5469D4] hover:bg-[#4356C7] text-white">
              {t('fixedAssets.applyFilters')}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="flex-1"
                disabled={!hasActiveFilters}
              >
                {t('fixedAssets.clearAll')}
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}