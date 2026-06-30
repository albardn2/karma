import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";

interface InventoryFilters {
  uuid?: string;
  material_uuid?: string;
  warehouse_uuid?: string;
  is_active?: boolean;
  currency?: string;
}

interface InventoryFiltersProps {
  filters: InventoryFilters;
  onFiltersChange: (filters: InventoryFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function InventoryFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: InventoryFiltersProps) {
  const [localFilters, setLocalFilters] = useState<InventoryFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: InventoryFilters = {};
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
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-[#5469D4] rounded-full"></span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Filter Inventory</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="uuid">UUID</Label>
                <Input
                  id="uuid"
                  placeholder="Filter by UUID"
                  value={localFilters.uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material_uuid">Material UUID</Label>
                <Input
                  id="material_uuid"
                  placeholder="Filter by material UUID"
                  value={localFilters.material_uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, material_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="warehouse_uuid">Warehouse UUID</Label>
                <Input
                  id="warehouse_uuid"
                  placeholder="Filter by warehouse UUID"
                  value={localFilters.warehouse_uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, warehouse_uuid: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_active">Status</Label>
                <Select
                  value={localFilters.is_active?.toString() || "all"}
                  onValueChange={(value) => 
                    setLocalFilters({ 
                      ...localFilters, 
                      is_active: value === "all" ? undefined : value === "true" 
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  placeholder="Filter by currency"
                  value={localFilters.currency || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, currency: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="per_page">Items per Page</Label>
                <Select
                  value={perPage.toString()}
                  onValueChange={(value) => onPerPageChange(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-4">
              {totalCount} total inventory items
            </p>
            <div className="flex gap-2">
              <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#5469D4]/90">
                Apply Filters
              </Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}