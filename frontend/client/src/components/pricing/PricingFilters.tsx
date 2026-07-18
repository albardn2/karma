import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface PricingFilters {
  uuid?: string;
  material_uuid?: string;
  currency?: string;
}

interface PricingFiltersProps {
  filters: PricingFilters;
  onFiltersChange: (filters: PricingFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function PricingFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: PricingFiltersProps) {
  const { t } = useLanguage();
  const [localFilters, setLocalFilters] = useState<PricingFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch currencies from API
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: PricingFilters = {
      uuid: "",
      material_uuid: "",
      currency: "",
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
          <SheetTitle>{t('pricing.filterTitle')}</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="uuid">{t('pricing.uuid')}</Label>
                <Input
                  id="uuid"
                  placeholder={t('pricing.filterByUuid')}
                  value={localFilters.uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material_uuid">{t('pricing.materialUuid')}</Label>
                <Input
                  id="material_uuid"
                  placeholder={t('pricing.filterByMaterialUuid')}
                  value={localFilters.material_uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, material_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">{t('common.currency')}</Label>
                <Select
                  value={localFilters.currency || "all"}
                  onValueChange={(value) => setLocalFilters({
                    ...localFilters,
                    currency: value === "all" ? "" : value
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('pricing.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('pricing.allCurrencies')}</SelectItem>
                    {currencies?.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="per_page">{t('pricing.itemsPerPage')}</Label>
                <Select
                  value={perPage.toString()}
                  onValueChange={(value) => onPerPageChange(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('pricing.selectItemsPerPage')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">{t('pricing.perPageOption', { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t('pricing.perPageOption', { count: 20 })}</SelectItem>
                    <SelectItem value="50">{t('pricing.perPageOption', { count: 50 })}</SelectItem>
                    <SelectItem value="100">{t('pricing.perPageOption', { count: 100 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-6 border-t">
            <Button onClick={handleApplyFilters} className="w-full bg-[#5469D4] hover:bg-[#4356C7] text-white">
              {t('pricing.applyFilters')}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="flex-1"
                disabled={!hasActiveFilters}
              >
                {t('pricing.clearAll')}
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