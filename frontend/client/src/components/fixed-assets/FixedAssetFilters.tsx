import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";

interface FixedAssetFilters {
  uuid?: string;
  name?: string;
  purchase_order_item_uuid?: string;
  material_uuid?: string;
}

interface FixedAssetFiltersProps {
  filters: FixedAssetFilters;
  onFiltersChange: (filters: FixedAssetFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function FixedAssetFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: FixedAssetFiltersProps) {
  const [localFilters, setLocalFilters] = useState<FixedAssetFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: FixedAssetFilters = {
      uuid: "",
      name: "",
      purchase_order_item_uuid: "",
      material_uuid: "",
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(filters).some(value => value && value !== "");

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
          <SheetTitle>Filter Fixed Assets</SheetTitle>
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
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Filter by asset name"
                  value={localFilters.name || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_order_item_uuid">Purchase Order Item UUID</Label>
                <Input
                  id="purchase_order_item_uuid"
                  placeholder="Filter by purchase order item UUID"
                  value={localFilters.purchase_order_item_uuid || ""}
                  onChange={(e) => setLocalFilters({ ...localFilters, purchase_order_item_uuid: e.target.value })}
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
                <Label htmlFor="per_page">Items per Page</Label>
                <Select
                  value={perPage.toString()}
                  onValueChange={(value) => onPerPageChange(parseInt(value))}
                >
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
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-6 border-t">
            <Button onClick={handleApplyFilters} className="w-full bg-[#5469D4] hover:bg-[#4356C7] text-white">
              Apply Filters
            </Button>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleClearFilters}
                className="flex-1"
                disabled={!hasActiveFilters}
              >
                Clear All
              </Button>
              <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}