import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { Filter, X } from "lucide-react";

interface PaymentFilters {
  uuid?: string;
  invoice_uuid?: string;
  financial_account_uuid?: string;
  debit_note_item_uuid?: string;
}

interface PaymentFiltersProps {
  filters: PaymentFilters;
  onFiltersChange: (filters: PaymentFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function PaymentFilters({ 
  filters, 
  onFiltersChange, 
  totalCount, 
  perPage, 
  onPerPageChange 
}: PaymentFiltersProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<PaymentFilters>(filters);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {};
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== null && value !== "");
  const activeFilterCount = Object.values(filters).filter(value => value !== undefined && value !== null && value !== "").length;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-gray-600 dark:text-gray-400">{t('payments.show')}</Label>
        <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(parseInt(value))}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {t('payments.ofPayments', { count: totalCount })}
        </span>
      </div>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="relative">
            <Filter className="h-4 w-4 me-2" />
            {t('common.filters')}
            {hasActiveFilters && (
              <span className="absolute -top-2 -end-2 bg-[#5469D4] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]" style={{ zIndex: 9999 }}>
          <SheetHeader>
            <SheetTitle>{t('payments.filterPayments')}</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="uuid">{t('payments.paymentUuid')}</Label>
              <Input
                id="uuid"
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, uuid: e.target.value }))}
                placeholder={t('payments.searchByPaymentUuid')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_uuid">{t('payments.invoiceUuid')}</Label>
              <Input
                id="invoice_uuid"
                value={localFilters.invoice_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, invoice_uuid: e.target.value }))}
                placeholder={t('payments.searchByInvoiceUuid')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="financial_account_uuid">{t('payments.financialAccountUuid')}</Label>
              <Input
                id="financial_account_uuid"
                value={localFilters.financial_account_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, financial_account_uuid: e.target.value }))}
                placeholder={t('payments.searchByFinancialAccountUuid')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debit_note_item_uuid">{t('payments.debitNoteItemUuid')}</Label>
              <Input
                id="debit_note_item_uuid"
                value={localFilters.debit_note_item_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, debit_note_item_uuid: e.target.value }))}
                placeholder={t('payments.searchByDebitNoteItemUuid')}
              />
            </div>

            <div className="flex gap-3 pt-6">
              <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white">
                {t('payments.applyFilters')}
              </Button>
              <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                <X className="h-4 w-4 me-2" />
                {t('payments.clear')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}