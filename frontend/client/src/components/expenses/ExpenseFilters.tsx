import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ExpenseFiltersType {
  uuid?: string;
  vendor_uuid?: string;
  category?: string;
  status?: string;
  is_paid?: boolean;
  page: number;
  per_page: number;
}

interface ExpenseFiltersProps {
  filters: ExpenseFiltersType;
  onFilterChange: (filters: Partial<ExpenseFiltersType>) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function ExpenseFilters({ 
  filters, 
  onFilterChange, 
  totalCount, 
  perPage, 
  onPerPageChange 
}: ExpenseFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<ExpenseFiltersType>>(filters);

  // Fetch expense categories
  const { data: categories = [] } = useQuery({
    queryKey: ["/expense/categories"],
    queryFn: () => apiRequest("/expense/categories"),
  });

  const hasActiveFilters = Boolean(
    filters.uuid ||
    filters.vendor_uuid ||
    filters.category ||
    filters.status ||
    filters.is_paid !== undefined
  );

  const activeFilterCount = [
    filters.uuid,
    filters.vendor_uuid,
    filters.category,
    filters.status,
    filters.is_paid !== undefined ? 'is_paid' : null
  ].filter(Boolean).length;

  const handleApplyFilters = () => {
    onFilterChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      uuid: undefined,
      vendor_uuid: undefined,
      category: undefined,
      status: undefined,
      is_paid: undefined,
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
          {totalCount} expenses
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
              <SheetTitle>Filter Expenses</SheetTitle>
            </SheetHeader>
            
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label htmlFor="uuid">Expense UUID</Label>
                <Input
                  id="uuid"
                  value={localFilters.uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, uuid: e.target.value || undefined }))}
                  placeholder="Search by expense UUID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor_uuid">Vendor UUID</Label>
                <Input
                  id="vendor_uuid"
                  value={localFilters.vendor_uuid || ""}
                  onChange={(e) => setLocalFilters(prev => ({ ...prev, vendor_uuid: e.target.value || undefined }))}
                  placeholder="Search by vendor UUID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={localFilters.category || "all"} 
                  onValueChange={(value) => setLocalFilters(prev => ({ ...prev, category: value === "all" ? undefined : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category: string) => (
                      <SelectItem key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={localFilters.status || "all"} 
                  onValueChange={(value) => setLocalFilters(prev => ({ ...prev, status: value === "all" ? undefined : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_paid">Payment Status</Label>
                <Select 
                  value={localFilters.is_paid !== undefined ? localFilters.is_paid.toString() : "all"} 
                  onValueChange={(value) => {
                    if (value === "all") {
                      setLocalFilters(prev => ({ ...prev, is_paid: undefined }));
                    } else {
                      setLocalFilters(prev => ({ ...prev, is_paid: value === "true" }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Paid</SelectItem>
                    <SelectItem value="false">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
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