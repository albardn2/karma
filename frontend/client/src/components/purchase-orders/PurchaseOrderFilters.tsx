import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
          Filters
          {hasActiveFilters && (
            <div className="absolute -top-1 -end-1 h-2 w-2 bg-[#5469D4] rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Filter Purchase Orders</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-6 mt-6 pe-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="uuid">UUID</Label>
              <Input
                id="uuid"
                placeholder="Enter purchase order UUID"
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="vendor_uuid">Vendor UUID</Label>
              <Input
                id="vendor_uuid"
                placeholder="Enter vendor UUID"
                value={localFilters.vendor_uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, vendor_uuid: e.target.value })}
              />
            </div>







            <div>
              <Label htmlFor="is_paid">Payment Status</Label>
              <Select value={localFilters.is_paid || ""} onValueChange={(value) => setLocalFilters({ ...localFilters, is_paid: value })}>
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

            <div>
              <Label htmlFor="is_overdue">Overdue Status</Label>
              <Select value={localFilters.is_overdue?.toString() || "all"} onValueChange={(value) => setLocalFilters({ ...localFilters, is_overdue: value === "all" ? undefined : value === "true" })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select overdue status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Overdue</SelectItem>
                  <SelectItem value="false">Not overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="is_fulfilled">Fulfillment Status</Label>
              <Select value={localFilters.is_fulfilled?.toString() || "all"} onValueChange={(value) => setLocalFilters({ ...localFilters, is_fulfilled: value === "all" ? undefined : value === "true" })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fulfillment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Fulfilled</SelectItem>
                  <SelectItem value="false">Not fulfilled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={localFilters.start_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, start_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">End Date</Label>
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
              <Label htmlFor="per_page">Items per page</Label>
              <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select items per page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {totalCount} total orders
              </p>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 border-t pt-4">
          <div className="flex gap-3">
            <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
              Apply Filters
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}