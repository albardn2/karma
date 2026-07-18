import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";

interface TransactionFiltersType {
  uuid?: string;
  from_account_uuid?: string;
  to_account_uuid?: string;
  start_date?: string;
  end_date?: string;
  page: number;
  per_page: number;
}

interface TransactionFiltersProps {
  filters: TransactionFiltersType;
  onFilterChange: (filters: Partial<TransactionFiltersType>) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function TransactionFilters({ 
  filters, 
  onFilterChange, 
  totalCount, 
  perPage, 
  onPerPageChange 
}: TransactionFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<TransactionFiltersType>>(filters);

  const hasActiveFilters = Boolean(
    filters.uuid ||
    filters.from_account_uuid ||
    filters.to_account_uuid ||
    filters.start_date ||
    filters.end_date
  );

  const activeFilterCount = [
    filters.uuid,
    filters.from_account_uuid,
    filters.to_account_uuid,
    filters.start_date,
    filters.end_date
  ].filter(Boolean).length;

  const handleApplyFilters = () => {
    onFilterChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      uuid: undefined,
      from_account_uuid: undefined,
      to_account_uuid: undefined,
      start_date: undefined,
      end_date: undefined,
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
          {totalCount} transactions
        </p>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative">
              <Filter className="h-4 w-4 me-2" />
              Filters
              {hasActiveFilters && (
                <span className="absolute -top-2 -end-2 bg-[#5469D4] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]" style={{ zIndex: 9999 }}>
            <SheetHeader>
              <SheetTitle>Filter Transactions</SheetTitle>
            </SheetHeader>
            
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label htmlFor="uuid">Transaction UUID</Label>
                <Input
                  id="uuid"
                  value={localFilters.uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, uuid: e.target.value || undefined }))}
                  placeholder="Search by transaction UUID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="from_account_uuid">From Account UUID</Label>
                <Input
                  id="from_account_uuid"
                  value={localFilters.from_account_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, from_account_uuid: e.target.value || undefined }))}
                  placeholder="Search by from account UUID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="to_account_uuid">To Account UUID</Label>
                <Input
                  id="to_account_uuid"
                  value={localFilters.to_account_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, to_account_uuid: e.target.value || undefined }))}
                  placeholder="Search by to account UUID"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="datetime-local"
                    value={localFilters.start_date || ""}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, start_date: e.target.value || undefined }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="datetime-local"
                    value={localFilters.end_date || ""}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, end_date: e.target.value || undefined }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
                  Apply Filters
                </Button>
                {hasActiveFilters && (
                  <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                    Clear All
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Per Page Selection */}
      <div className="flex items-center gap-2">
        <Label htmlFor="perPage" className="text-sm">Show:</Label>
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
        <span className="text-sm text-gray-600 dark:text-gray-400">per page</span>
      </div>
    </div>
  );
}