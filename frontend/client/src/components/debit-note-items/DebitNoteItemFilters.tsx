import { useState, useEffect } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface DebitNoteItemFiltersProps {
  filters: {
    uuid: string;
    invoice_item_uuid: string;
    customer_order_item_uuid: string;
    purchase_order_item_uuid: string;
    customer_uuid: string;
    vendor_uuid: string;
    status: string;
    is_paid: boolean | undefined;
  };
  onFiltersChange: (filters: any) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function DebitNoteItemFilters({ 
  filters, 
  onFiltersChange, 
  totalCount, 
  perPage, 
  onPerPageChange 
}: DebitNoteItemFiltersProps) {
  const [localFilters, setLocalFilters] = useState({
    uuid: filters.uuid || "",
    invoice_item_uuid: filters.invoice_item_uuid || "",
    customer_order_item_uuid: filters.customer_order_item_uuid || "",
    purchase_order_item_uuid: filters.purchase_order_item_uuid || "",
    customer_uuid: filters.customer_uuid || "",
    vendor_uuid: filters.vendor_uuid || "",
    status: filters.status || "all",
    is_paid: filters.is_paid
  });

  // Get status options from API
  const { data: statusOptions } = useQuery<string[]>({
    queryKey: ["/debit-note-item/status"],
    staleTime: 300000 // 5 minutes
  });

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

  const handleApplyFilters = () => {
    console.log('Applying filters:', localFilters);
    const filtersToApply = {
      ...localFilters,
      status: localFilters.status === "all" ? "" : localFilters.status
    };
    onFiltersChange(filtersToApply);
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
      is_paid: undefined as boolean | undefined
    };
    setLocalFilters(clearedFilters);
    onFiltersChange({
      ...clearedFilters,
      status: ""
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (localFilters.uuid) count++;
    if (localFilters.invoice_item_uuid) count++;
    if (localFilters.customer_order_item_uuid) count++;
    if (localFilters.purchase_order_item_uuid) count++;
    if (localFilters.customer_uuid) count++;
    if (localFilters.vendor_uuid) count++;
    if (localFilters.status && localFilters.status !== "all") count++;
    if (localFilters.is_paid !== undefined) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="flex items-center gap-2">
      <Select value={perPage.toString()} onValueChange={(value) => onPerPageChange(Number(value))}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="10">10</SelectItem>
          <SelectItem value="20">20</SelectItem>
          <SelectItem value="50">50</SelectItem>
          <SelectItem value="100">100</SelectItem>
        </SelectContent>
      </Select>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="relative">
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] z-[9999]">
          <SheetHeader>
            <SheetTitle>Filter Debit Note Items</SheetTitle>
            <SheetDescription>
              Apply filters to find specific debit note items. Showing {totalCount} total items.
            </SheetDescription>
          </SheetHeader>
          
          <div className="space-y-6 py-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="uuid">UUID</Label>
                <Input
                  id="uuid"
                  placeholder="Filter by UUID..."
                  value={localFilters.uuid}
                  onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice_item_uuid">Invoice Item UUID</Label>
                <Input
                  id="invoice_item_uuid"
                  placeholder="Filter by invoice item UUID..."
                  value={localFilters.invoice_item_uuid}
                  onChange={(e) => setLocalFilters({ ...localFilters, invoice_item_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_order_item_uuid">Customer Order Item UUID</Label>
                <Input
                  id="customer_order_item_uuid"
                  placeholder="Filter by customer order item UUID..."
                  value={localFilters.customer_order_item_uuid}
                  onChange={(e) => setLocalFilters({ ...localFilters, customer_order_item_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_order_item_uuid">Purchase Order Item UUID</Label>
                <Input
                  id="purchase_order_item_uuid"
                  placeholder="Filter by purchase order item UUID..."
                  value={localFilters.purchase_order_item_uuid}
                  onChange={(e) => setLocalFilters({ ...localFilters, purchase_order_item_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_uuid">Customer UUID</Label>
                <Input
                  id="customer_uuid"
                  placeholder="Filter by customer UUID..."
                  value={localFilters.customer_uuid}
                  onChange={(e) => setLocalFilters({ ...localFilters, customer_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor_uuid">Vendor UUID</Label>
                <Input
                  id="vendor_uuid"
                  placeholder="Filter by vendor UUID..."
                  value={localFilters.vendor_uuid}
                  onChange={(e) => setLocalFilters({ ...localFilters, vendor_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={localFilters.status} 
                  onValueChange={(value) => setLocalFilters({ ...localFilters, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statusOptions?.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_paid">Payment Status</Label>
                <Select 
                  value={localFilters.is_paid === undefined ? "all" : localFilters.is_paid.toString()} 
                  onValueChange={(value) => setLocalFilters({ 
                    ...localFilters, 
                    is_paid: value === "all" ? undefined : value === "true" 
                  })}
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
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleApplyFilters} className="flex-1">
                Apply Filters
              </Button>
              <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                Clear All
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}