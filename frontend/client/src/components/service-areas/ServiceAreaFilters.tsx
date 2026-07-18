import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ServiceAreaFilters {
  uuid?: string;
  created_by_uuid?: string;
  name?: string;
  intersects_polygon?: string;
}

interface ServiceAreaFiltersProps {
  filters: ServiceAreaFilters;
  onFiltersChange: (filters: ServiceAreaFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function ServiceAreaFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: ServiceAreaFiltersProps) {
  const { t } = useLanguage();
  const [localFilters, setLocalFilters] = useState<ServiceAreaFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: ServiceAreaFilters = {};
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== undefined && value !== null && value !== ""
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="h-4 w-4 me-2" />
          {t('common.filters')}
          {hasActiveFilters && (
            <div className="absolute -top-1 -end-1 h-2 w-2 bg-[#5469D4] rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80">
        <SheetHeader>
          <SheetTitle>{t('serviceAreas.filterServiceAreas')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="uuid">{t('serviceAreas.uuid')}</Label>
              <Input
                id="uuid"
                placeholder={t('serviceAreas.enterUuid')}
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="name">{t('common.name')}</Label>
              <Input
                id="name"
                placeholder={t('serviceAreas.enterName')}
                value={localFilters.name || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="created_by_uuid">{t('serviceAreas.createdByUuid')}</Label>
              <Input
                id="created_by_uuid"
                placeholder={t('serviceAreas.enterCreatorUuid')}
                value={localFilters.created_by_uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, created_by_uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="intersects_polygon">{t('serviceAreas.intersectsPolygon')}</Label>
              <Input
                id="intersects_polygon"
                placeholder={t('serviceAreas.enterWktPolygon')}
                value={localFilters.intersects_polygon || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, intersects_polygon: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 border-t space-y-3">
            <div>
              <Label htmlFor="per_page">{t('serviceAreas.itemsPerPage')}</Label>
              <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('serviceAreas.selectItemsPerPage')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">{t('serviceAreas.perPageOption', { count: 10 })}</SelectItem>
                  <SelectItem value="20">{t('serviceAreas.perPageOption', { count: 20 })}</SelectItem>
                  <SelectItem value="50">{t('serviceAreas.perPageOption', { count: 50 })}</SelectItem>
                  <SelectItem value="100">{t('serviceAreas.perPageOption', { count: 100 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('serviceAreas.totalAreas', { count: totalCount })}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
              {t('serviceAreas.applyFilters')}
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              {t('serviceAreas.clear')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}