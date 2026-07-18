import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { Filter, X } from "lucide-react";

interface PayoutFiltersType {
  uuid?: string;
  credit_note_item_uuid?: string;
  purchase_order_uuid?: string;
  expense_uuid?: string;
  employee_uuid?: string;
  page: number;
  per_page: number;
}

interface PayoutFiltersProps {
  filters: PayoutFiltersType;
  onFilterChange: (filters: Partial<PayoutFiltersType>) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function PayoutFilters({ 
  filters, 
  onFilterChange, 
  totalCount, 
  perPage, 
  onPerPageChange 
}: PayoutFiltersProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<PayoutFiltersType>>(filters);

  const hasActiveFilters = Boolean(
    filters.uuid ||
    filters.credit_note_item_uuid ||
    filters.purchase_order_uuid ||
    filters.expense_uuid ||
    filters.employee_uuid
  );

  const activeFilterCount = [
    filters.uuid,
    filters.credit_note_item_uuid,
    filters.purchase_order_uuid,
    filters.expense_uuid,
    filters.employee_uuid
  ].filter(Boolean).length;

  const handleApplyFilters = () => {
    onFilterChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      uuid: undefined,
      credit_note_item_uuid: undefined,
      purchase_order_uuid: undefined,
      expense_uuid: undefined,
      employee_uuid: undefined,
    };
    setLocalFilters(clearedFilters);
    onFilterChange(clearedFilters);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* Results Count */}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("payouts.countPayouts", { count: totalCount })}
        </p>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative">
              <Filter className="h-4 w-4 me-2" />
              {t("common.filters")}
              {hasActiveFilters && (
                <span className="absolute -top-2 -end-2 bg-[#5469D4] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]" style={{ zIndex: 9999 }}>
            <SheetHeader>
              <SheetTitle>{t("payouts.filterTitle")}</SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label htmlFor="uuid">{t("payouts.payoutUuid")}</Label>
                <Input
                  id="uuid"
                  value={localFilters.uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, uuid: e.target.value || undefined }))}
                  placeholder={t("payouts.searchByPayoutUuid")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit_note_item_uuid">{t("payouts.creditNoteItemUuid")}</Label>
                <Input
                  id="credit_note_item_uuid"
                  value={localFilters.credit_note_item_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, credit_note_item_uuid: e.target.value || undefined }))}
                  placeholder={t("payouts.searchByCreditNoteItemUuid")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_order_uuid">{t("payouts.purchaseOrderUuid")}</Label>
                <Input
                  id="purchase_order_uuid"
                  value={localFilters.purchase_order_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, purchase_order_uuid: e.target.value || undefined }))}
                  placeholder={t("payouts.searchByPurchaseOrderUuid")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense_uuid">{t("payouts.expenseUuid")}</Label>
                <Input
                  id="expense_uuid"
                  value={localFilters.expense_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, expense_uuid: e.target.value || undefined }))}
                  placeholder={t("payouts.searchByExpenseUuid")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee_uuid">{t("payouts.employeeUuid")}</Label>
                <Input
                  id="employee_uuid"
                  value={localFilters.employee_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, employee_uuid: e.target.value || undefined }))}
                  placeholder={t("payouts.searchByEmployeeUuid")}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
                  {t("payouts.applyFilters")}
                </Button>
                {hasActiveFilters && (
                  <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                    {t("payouts.clearAll")}
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Per Page Selection */}
      <div className="flex items-center gap-2">
        <Label htmlFor="perPage" className="text-sm">{t("payouts.show")}</Label>
        <select
          id="perPage"
          value={perPage}
          onChange={(e) => onPerPageChange(parseInt(e.target.value))}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-600 dark:text-gray-400">{t("common.perPage")}</span>
      </div>
    </div>
  );
}