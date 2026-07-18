import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { VehicleStatus, type VehicleFilters } from "@/lib/types";

interface VehicleFiltersComponentProps {
  filters: VehicleFilters;
  onFiltersChange: (filters: VehicleFilters) => void;
  onClearFilters: () => void;
}

export function VehicleFiltersComponent({ filters, onFiltersChange, onClearFilters }: VehicleFiltersComponentProps) {
  const [localFilters, setLocalFilters] = useState<VehicleFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onFiltersChange({ ...localFilters, page: 1 });
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: VehicleFilters = { page: 1, per_page: filters.per_page };
    setLocalFilters(clearedFilters);
    onClearFilters();
    setIsOpen(false);
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof VehicleFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative" data-testid="button-filters">
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-2 py-1 ms-2">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof VehicleFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Filter Vehicles</SheetTitle>
          <SheetDescription>
            Apply filters to narrow down the vehicle list
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="plate_number">Plate Number</Label>
            <Input
              id="plate_number"
              value={localFilters.plate_number || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, plate_number: e.target.value })}
              placeholder="Search by plate number"
              data-testid="input-filter-plate"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="make">Make</Label>
            <Input
              id="make"
              value={localFilters.make || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, make: e.target.value })}
              placeholder="Search by make (e.g., Toyota)"
              data-testid="input-filter-make"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={localFilters.model || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, model: e.target.value })}
              placeholder="Search by model (e.g., Camry)"
              data-testid="input-filter-model"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              value={localFilters.year || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, year: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Search by year"
              data-testid="input-filter-year"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Input
              id="color"
              value={localFilters.color || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, color: e.target.value })}
              placeholder="Search by color"
              data-testid="input-filter-color"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={localFilters.status || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, status: value === "all" ? undefined : value as VehicleStatus })}
            >
              <SelectTrigger data-testid="select-filter-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value={VehicleStatus.ACTIVE}>Active</SelectItem>
                <SelectItem value={VehicleStatus.INACTIVE}>Inactive</SelectItem>
                <SelectItem value={VehicleStatus.SOLD}>Sold</SelectItem>
                <SelectItem value={VehicleStatus.MAINTENANCE}>Maintenance</SelectItem>
                <SelectItem value={VehicleStatus.RETIRED}>Retired</SelectItem>
                <SelectItem value={VehicleStatus.UTILIZED}>Utilized</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vin">VIN</Label>
            <Input
              id="vin"
              value={localFilters.vin || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, vin: e.target.value })}
              placeholder="Search by VIN"
              data-testid="input-filter-vin"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="per_page">Items per page</Label>
            <Select
              value={localFilters.per_page?.toString() || "12"}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger data-testid="select-filter-per-page">
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="12">12 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleApply} className="flex-1" data-testid="button-apply-filters">
              Apply Filters
            </Button>
            <Button onClick={handleClear} variant="outline" className="flex-1" data-testid="button-clear-filters">
              Clear Filters
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { VehicleFilters };
