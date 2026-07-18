import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -end-1 bg-[#5469D4] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] z-[9999]">
          <SheetHeader>
            <SheetTitle>Filter Customer Orders</SheetTitle>
          </SheetHeader>
          
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="uuid">UUID</Label>
              <Input
                id="uuid"
                placeholder="Search by UUID..."
                value={localFilters.uuid || ""}
                onChange={(e) => handleFilterChange("uuid", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_uuid">Customer UUID</Label>
              <Input
                id="customer_uuid"
                placeholder="Search by customer UUID..."
                value={localFilters.customer_uuid || ""}
                onChange={(e) => handleFilterChange("customer_uuid", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="is_paid">Payment Status</Label>
                <Select 
                  value={localFilters.is_paid?.toString() || ""} 
                  onValueChange={(value) => handleFilterChange("is_paid", value === "" ? undefined : value === "true")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Paid</SelectItem>
                    <SelectItem value="false">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_fulfilled">Fulfillment Status</Label>
                <Select 
                  value={localFilters.is_fulfilled?.toString() || ""} 
                  onValueChange={(value) => handleFilterChange("is_fulfilled", value === "" ? undefined : value === "true")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Fulfilled</SelectItem>
                    <SelectItem value="false">Unfulfilled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="is_overdue">Overdue Status</Label>
              <Select 
                value={localFilters.is_overdue?.toString() || ""} 
                onValueChange={(value) => handleFilterChange("is_overdue", value === "" ? undefined : value === "true")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Overdue</SelectItem>
                  <SelectItem value="false">Not overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={localFilters.start_date || ""}
                  onChange={(e) => handleFilterChange("start_date", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={localFilters.end_date || ""}
                  onChange={(e) => handleFilterChange("end_date", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="per_page">Items per page</Label>
              <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-4">
              <Button onClick={handleApplyFilters} className="bg-[#5469D4] hover:bg-[#4356C7]">
                Apply Filters
              </Button>
              <Button onClick={handleClearFilters} variant="outline">
                Clear Filters
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        {totalCount} {totalCount === 1 ? 'order' : 'orders'}
      </div>
    </div>
  );
}