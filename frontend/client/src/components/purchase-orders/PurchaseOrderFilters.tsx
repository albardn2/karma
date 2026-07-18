import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { Filter } from "lucide-react";

interface PurchaseOrderFilters {
  uuid?: string;
  vendor_uuid?: string;
  is_paid?: boolean;
  is_overdue?: boolean;
  is_fulfilled?: boolean;
  start_date?: string;
  end_date?: string;
}

interface PurchaseOrderFiltersProps {
  filters: PurchaseOrderFilters;
  onFiltersChange: (filters: PurchaseOrderFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function PurchaseOrderFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: PurchaseOrderFiltersProps) {
  const { t } = useLanguage();
  const [localFilters, setLocalFilters] = useState<PurchaseOrderFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);



  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: PurchaseOrderFilters = {};
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
      <SheetContent className="w-80 flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{t('purchaseOrders.filterTitle')}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-6 mt-6 pe-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="uuid">{t('purchaseOrders.uuid')}</Label>
              <Input
                id="uuid"
                placeholder={t('purchaseOrders.uuidPlaceholder')}
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="vendor_uuid">{t('purchaseOrders.vendorUuid')}</Label>
              <Input
                id="vendor_uuid"
                placeholder={t('purchaseOrders.vendorUuidPlaceholder')}
                value={localFilters.vendor_uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, vendor_uuid: e.target.value })}
              />
            </div>







            <div>
              <Label htmlFor="is_paid">{t('purchaseOrders.paymentStatus')}</Label>
              <Select value={localFilters.is_paid || ""} onValueChange={(value) => setLocalFilters({ ...localFilters, is_paid: value })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('purchaseOrders.selectPaymentStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="true">{t('purchaseOrders.paid')}</SelectItem>
                  <SelectItem value="false">{t('purchaseOrders.unpaid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="is_overdue">{t('purchaseOrders.overdueStatus')}</Label>
              <Select value={localFilters.is_overdue?.toString() || "all"} onValueChange={(value) => setLocalFilters({ ...localFilters, is_overdue: value === "all" ? undefined : value === "true" })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('purchaseOrders.selectOverdueStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="true">{t('purchaseOrders.overdue')}</SelectItem>
                  <SelectItem value="false">{t('purchaseOrders.notOverdue')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="is_fulfilled">{t('purchaseOrders.fulfillmentStatus')}</Label>
              <Select value={localFilters.is_fulfilled?.toString() || "all"} onValueChange={(value) => setLocalFilters({ ...localFilters, is_fulfilled: value === "all" ? undefined : value === "true" })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('purchaseOrders.selectFulfillmentStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="true">{t('purchaseOrders.fulfilled')}</SelectItem>
                  <SelectItem value="false">{t('purchaseOrders.notFulfilled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="start_date">{t('purchaseOrders.startDate')}</Label>
              <Input
                id="start_date"
                type="date"
                value={localFilters.start_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, start_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">{t('purchaseOrders.endDate')}</Label>
              <Input
                id="end_date"
                type="date"
                value={localFilters.end_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 border-t space-y-3">
            <div>
              <Label htmlFor="per_page">{t('purchaseOrders.itemsPerPage')}</Label>
              <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('purchaseOrders.selectItemsPerPage')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">{t('purchaseOrders.perPageOption', { count: 10 })}</SelectItem>
                  <SelectItem value="20">{t('purchaseOrders.perPageOption', { count: 20 })}</SelectItem>
                  <SelectItem value="50">{t('purchaseOrders.perPageOption', { count: 50 })}</SelectItem>
                  <SelectItem value="100">{t('purchaseOrders.perPageOption', { count: 100 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('purchaseOrders.totalOrders', { count: totalCount })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 border-t pt-4">
          <div className="flex gap-3">
            <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
              {t('purchaseOrders.applyFilters')}
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              {t('purchaseOrders.clear')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}