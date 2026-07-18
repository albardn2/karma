import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MaterialFilters } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

interface MaterialFiltersComponentProps {
  filters: MaterialFilters;
  onFiltersChange: (filters: MaterialFilters) => void;
}

export function MaterialFiltersComponent({ filters, onFiltersChange }: MaterialFiltersComponentProps) {
  const { t, te } = useLanguage();
  const [localFilters, setLocalFilters] = useState<MaterialFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch material categories
  const { data: materialTypes } = useQuery<string[]>({
    queryKey: ["/material/material-type"],
    queryFn: async () => {
      return await apiRequest("/material/material-type");
    },
  });

  const handleApply = () => {
    onFiltersChange({ ...localFilters, page: 1 });
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: MaterialFilters = { page: 1, per_page: filters.per_page };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const getFilterCount = () => {
    let count = 0;
    if (filters.uuid) count++;
    if (filters.name) count++;
    if (filters.sku) count++;
    if (filters.type) count++;
    return count;
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof MaterialFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Filter className="h-4 w-4" />
          {t('common.filters')}
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-2 py-1 ms-2">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof MaterialFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>{t('materials.filterMaterials')}</SheetTitle>
          <SheetDescription>
            {t('materials.filterDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="uuid">{t('materials.uuid')}</Label>
            <Input
              id="uuid"
              value={localFilters.uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              placeholder={t('materials.searchByUuid')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">{t('materials.materialName')}</Label>
            <Input
              id="name"
              value={localFilters.name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, name: e.target.value })}
              placeholder={t('materials.searchByName')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">{t('materials.sku')}</Label>
            <Input
              id="sku"
              value={localFilters.sku || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, sku: e.target.value })}
              placeholder={t('materials.searchBySku')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">{t('materials.materialType')}</Label>
            <Select
              value={localFilters.type || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, type: value === "all" ? undefined : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('materials.selectTypeShort')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('materials.allTypes')}</SelectItem>
                {materialTypes?.map(type => (
                  <SelectItem key={type} value={type}>
                    {te(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="per_page">{t('materials.itemsPerPage')}</Label>
            <Select
              value={localFilters.per_page?.toString() || "20"}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('materials.itemsPerPage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{t('materials.perPageOption', { count: 10 })}</SelectItem>
                <SelectItem value="20">{t('materials.perPageOption', { count: 20 })}</SelectItem>
                <SelectItem value="50">{t('materials.perPageOption', { count: 50 })}</SelectItem>
                <SelectItem value="100">{t('materials.perPageOption', { count: 100 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleApply} className="flex-1">
              {t('materials.applyFilters')}
            </Button>
            <Button onClick={handleClear} variant="outline" className="flex-1">
              {t('common.clearFilters')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { MaterialFilters };