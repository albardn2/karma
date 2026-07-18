import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface InventoryEventFilters {
  uuid?: string;
  inventory_uuid?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
}

interface InventoryEventFiltersProps {
  filters: InventoryEventFilters;
  onFiltersChange: (filters: InventoryEventFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function InventoryEventFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: InventoryEventFiltersProps) {
  const { t, te } = useLanguage();
  const [localFilters, setLocalFilters] = useState<InventoryEventFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch event types from API
  const { data: eventTypes } = useQuery<string[]>({
    queryKey: ["/inventory-event/event_types"],
    queryFn: async () => {
      return await apiRequest("/inventory-event/event_types");
    },
  });

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: InventoryEventFilters = {};
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
          <SheetTitle>{t('inventoryEvents.filterTitle')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="uuid">{t('inventoryEvents.uuid')}</Label>
              <Input
                id="uuid"
                placeholder={t('inventoryEvents.eventUuidPlaceholder')}
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="inventory_uuid">{t('inventoryEvents.inventoryUuid')}</Label>
              <Input
                id="inventory_uuid"
                placeholder={t('inventoryEvents.inventoryUuidPlaceholder')}
                value={localFilters.inventory_uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, inventory_uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="event_type">{t('inventoryEvents.eventType')}</Label>
              <Select
                value={localFilters.event_type || "all"}
                onValueChange={(value) => setLocalFilters({ ...localFilters, event_type: value === "all" ? undefined : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('inventoryEvents.selectEventType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('inventoryEvents.allTypes')}</SelectItem>
                  {eventTypes?.map((type) => (
                    <SelectItem key={type} value={type}>
                      {te(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="start_date">{t('inventoryEvents.startDate')}</Label>
              <Input
                id="start_date"
                type="datetime-local"
                value={localFilters.start_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, start_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">{t('inventoryEvents.endDate')}</Label>
              <Input
                id="end_date"
                type="datetime-local"
                value={localFilters.end_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, end_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="per_page">{t('inventoryEvents.itemsPerPage')}</Label>
              <Select value={String(perPage)} onValueChange={(value) => onPerPageChange(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {t('inventoryEvents.totalEvents', { count: totalCount })}
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
              {t('inventoryEvents.applyFilters')}
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              {t('inventoryEvents.clear')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}