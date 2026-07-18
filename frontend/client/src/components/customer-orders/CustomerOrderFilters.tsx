import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface CustomerOrderFilters {
  uuid?: string;
  customer_uuid?: string;
  is_paid?: boolean;
  is_overdue?: boolean;
  is_fulfilled?: boolean;
  start_date?: string;
  end_date?: string;
}

interface CustomerOrderFiltersProps {
  filters: CustomerOrderFilters;
  onFiltersChange: (filters: CustomerOrderFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function CustomerOrderFilters({
  filters,
  onFiltersChange,
  totalCount,
  perPage,
  onPerPageChange,
}: CustomerOrderFiltersProps) {
  const { t } = useLanguage();
  const [localFilters, setLocalFilters] = useState<CustomerOrderFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // No need to fetch customers since we're using UUID input

  const handleFilterChange = (key: keyof CustomerOrderFilters, value: any) => {
    const newFilters = { ...localFilters, [key]: value === "" || value === "all" ? undefined : value };
    setLocalFilters(newFilters);
  };

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {};
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const activeFilterCount = Object.values(filters).filter(value => 
    value !== undefined && value !== null && value !== ""
  ).length;

  return (
    <div className="flex items-center gap-2">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <Filter className="h-4 w-4 me-2" />
            {t('common.filters')}
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -end-1 bg-[#5469D4] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] z-[9999]">
          <SheetHeader>
            <SheetTitle>{t('customerOrders.filterOrders')}</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="uuid">{t('customerOrders.uuid')}</Label>
              <Input
                id="uuid"
                placeholder={t('customerOrders.searchByUuid')}
                value={localFilters.uuid || ""}
                onChange={(e) => handleFilterChange("uuid", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_uuid">{t('customerOrders.customerUuid')}</Label>
              <Input
                id="customer_uuid"
                placeholder={t('customerOrders.searchByCustomerUuid')}
                value={localFilters.customer_uuid || ""}
                onChange={(e) => handleFilterChange("customer_uuid", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="is_paid">{t('customerOrders.paymentStatus')}</Label>
                <Select
                  value={localFilters.is_paid?.toString() || ""}
                  onValueChange={(value) => handleFilterChange("is_paid", value === "" ? undefined : value === "true")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="true">{t('customerOrders.paid')}</SelectItem>
                    <SelectItem value="false">{t('customerOrders.unpaid')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_fulfilled">{t('customerOrders.fulfillmentStatus')}</Label>
                <Select
                  value={localFilters.is_fulfilled?.toString() || ""}
                  onValueChange={(value) => handleFilterChange("is_fulfilled", value === "" ? undefined : value === "true")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="true">{t('customerOrders.fulfilled')}</SelectItem>
                    <SelectItem value="false">{t('customerOrders.unfulfilled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_overdue">{t('customerOrders.overdueStatus')}</Label>
              <Select
                value={localFilters.is_overdue?.toString() || ""}
                onValueChange={(value) => handleFilterChange("is_overdue", value === "" ? undefined : value === "true")}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="true">{t('customerOrders.overdue')}</SelectItem>
                  <SelectItem value="false">{t('customerOrders.notOverdue')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">{t('customerOrders.startDate')}</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={localFilters.start_date || ""}
                  onChange={(e) => handleFilterChange("start_date", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">{t('customerOrders.endDate')}</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={localFilters.end_date || ""}
                  onChange={(e) => handleFilterChange("end_date", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="per_page">{t('customerOrders.itemsPerPage')}</Label>
              <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">{t('customerOrders.nPerPage', { count: 10 })}</SelectItem>
                  <SelectItem value="20">{t('customerOrders.nPerPage', { count: 20 })}</SelectItem>
                  <SelectItem value="50">{t('customerOrders.nPerPage', { count: 50 })}</SelectItem>
                  <SelectItem value="100">{t('customerOrders.nPerPage', { count: 100 })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-4">
              <Button onClick={handleApplyFilters} className="bg-[#5469D4] hover:bg-[#4356C7]">
                {t('customerOrders.applyFilters')}
              </Button>
              <Button onClick={handleClearFilters} variant="outline">
                {t('common.clearFilters')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        {totalCount} {totalCount === 1 ? t('customerOrders.orderSingular') : t('customerOrders.orderPlural')}
      </div>
    </div>
  );
}