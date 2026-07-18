import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface FilterParams {
  uuid?: string;
  invoice_item_uuid?: string;
  customer_order_item_uuid?: string;
  purchase_order_item_uuid?: string;
  customer_uuid?: string;
  vendor_uuid?: string;
  status?: string;
  is_paid?: boolean;
  page: number;
  per_page: number;
}

interface CreditNoteItemFiltersProps {
  filters: FilterParams;
  onFiltersChange: (filters: Partial<FilterParams>) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function CreditNoteItemFilters({ 
  filters, 
  onFiltersChange, 
  totalCount, 
  perPage, 
  onPerPageChange 
}: CreditNoteItemFiltersProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<FilterParams>>(() => ({
    uuid: filters.uuid || "",
    invoice_item_uuid: filters.invoice_item_uuid || "",
    customer_order_item_uuid: filters.customer_order_item_uuid || "",
    purchase_order_item_uuid: filters.purchase_order_item_uuid || "",
    customer_uuid: filters.customer_uuid || "",
    vendor_uuid: filters.vendor_uuid || "",
    status: filters.status || "all",
    is_paid: filters.is_paid
  }));

  // Sync local filters with props when they change
  useEffect(() => {
    setLocalFilters({
      uuid: filters.uuid || "",
      invoice_item_uuid: filters.invoice_item_uuid || "",
      customer_order_item_uuid: filters.customer_order_item_uuid || "",
      purchase_order_item_uuid: filters.purchase_order_item_uuid || "",
      customer_uuid: filters.customer_uuid || "",
      vendor_uuid: filters.vendor_uuid || "",
      status: filters.status || "all",
      is_paid: filters.is_paid
    });
  }, [filters]);

  // Fetch available statuses
  const { data: statuses } = useQuery({
    queryKey: ["/credit-note-item/status"],
    enabled: true
  });

  const handleApplyFilters = () => {
    console.log("Applying filters:", localFilters);
    const cleanedFilters = Object.fromEntries(
      Object.entries(localFilters).filter(([_, value]) => 
        value !== "" && value !== undefined && value !== null
      )
    );
    console.log("Cleaned filters:", cleanedFilters);
    onFiltersChange(cleanedFilters);
    setOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      uuid: "",
      invoice_item_uuid: "",
      customer_order_item_uuid: "",
      purchase_order_item_uuid: "",
      customer_uuid: "",
      vendor_uuid: "",
      status: "all",
      is_paid: undefined
    };
    setLocalFilters(clearedFilters);
    onFiltersChange({});
    setOpen(false);
  };

  const activeFilterCount = Object.values(localFilters).filter(value => 
    value !== "" && value !== undefined && value !== null
  ).length;

  return (
    <div className="flex items-center gap-2">
      {/* Per Page Selector */}
      <div className="flex items-center gap-2">
        <Label htmlFor="perPage" className="text-sm whitespace-nowrap">Show:</Label>
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
        <span className="text-sm text-gray-500 whitespace-nowrap">
          of {totalCount} items
        </span>
      </div>

      {/* Filter Button */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="relative"
            onClick={() => {
              console.log("Filter button clicked!");
              setOpen(true);
            }}
          >
            <Filter className="h-4 w-4 me-2" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ms-2 bg-purple-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] z-[9999]">
          <SheetHeader>
            <SheetTitle>Filter Credit Note Items</SheetTitle>
            <SheetDescription>
              Use the filters below to narrow down the credit note items list.
            </SheetDescription>
          </SheetHeader>
          
          <div className="grid gap-4 py-4">
            {/* UUID Filter */}
            <div className="space-y-2">
              <Label htmlFor="uuid">Credit Note Item UUID</Label>
              <Input
                id="uuid"
                placeholder="Enter credit note item UUID..."
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, uuid: e.target.value }))}
              />
            </div>

            {/* Invoice Item UUID Filter */}
            <div className="space-y-2">
              <Label htmlFor="invoice_item_uuid">Invoice Item UUID</Label>
              <Input
                id="invoice_item_uuid"
                placeholder="Enter invoice item UUID..."
                value={localFilters.invoice_item_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, invoice_item_uuid: e.target.value }))}
              />
            </div>

            {/* Customer Order Item UUID Filter */}
            <div className="space-y-2">
              <Label htmlFor="customer_order_item_uuid">Customer Order Item UUID</Label>
              <Input
                id="customer_order_item_uuid"
                placeholder="Enter customer order item UUID..."
                value={localFilters.customer_order_item_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, customer_order_item_uuid: e.target.value }))}
              />
            </div>

            {/* Purchase Order Item UUID Filter */}
            <div className="space-y-2">
              <Label htmlFor="purchase_order_item_uuid">Purchase Order Item UUID</Label>
              <Input
                id="purchase_order_item_uuid"
                placeholder="Enter purchase order item UUID..."
                value={localFilters.purchase_order_item_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, purchase_order_item_uuid: e.target.value }))}
              />
            </div>

            {/* Customer UUID Filter */}
            <div className="space-y-2">
              <Label htmlFor="customer_uuid">Customer UUID</Label>
              <Input
                id="customer_uuid"
                placeholder="Enter customer UUID..."
                value={localFilters.customer_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, customer_uuid: e.target.value }))}
              />
            </div>

            {/* Vendor UUID Filter */}
            <div className="space-y-2">
              <Label htmlFor="vendor_uuid">Vendor UUID</Label>
              <Input
                id="vendor_uuid"
                placeholder="Enter vendor UUID..."
                value={localFilters.vendor_uuid || ""}
                onChange={(e) => setLocalFilters(prev => ({ ...prev, vendor_uuid: e.target.value }))}
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={localFilters.status || "all"} 
                onValueChange={(value) => setLocalFilters(prev => ({ ...prev, status: value === "all" ? undefined : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses && Array.isArray(statuses) ? statuses.map((status: string) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  )) : (
                    <>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="is_paid">Payment Status</Label>
              <Select 
                value={localFilters.is_paid === undefined ? "all" : localFilters.is_paid.toString()} 
                onValueChange={(value) => setLocalFilters(prev => ({ 
                  ...prev, 
                  is_paid: value === "all" ? undefined : value === "true"
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All payment statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment statuses</SelectItem>
                  <SelectItem value="true">Paid</SelectItem>
                  <SelectItem value="false">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={handleClearFilters}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Clear All
            </Button>
            <Button 
              onClick={handleApplyFilters}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Apply Filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}