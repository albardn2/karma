import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { MaterialFilters } from "@/lib/types";

interface MaterialFiltersComponentProps {
  filters: MaterialFilters;
  onFiltersChange: (filters: MaterialFilters) => void;
}

export function MaterialFiltersComponent({ filters, onFiltersChange }: MaterialFiltersComponentProps) {
  const [localFilters, setLocalFilters] = useState<MaterialFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch material categories
  const { data: materialTypes } = useQuery<string[]>({
    queryKey: ["/material/material-type"],
    queryFn: async () => {
      return await apiRequest("/material/material-type");
    },
  });

  const handleApply = () => {
    onFiltersChange({ ...localFilters, page: 1 });
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: MaterialFilters = { page: 1, per_page: filters.per_page };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const getFilterCount = () => {
    let count = 0;
    if (filters.uuid) count++;
    if (filters.name) count++;
    if (filters.sku) count++;
    if (filters.type) count++;
    return count;
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof MaterialFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-2 py-1 ml-2">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof MaterialFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Filter Materials</SheetTitle>
          <SheetDescription>
            Apply filters to narrow down the material list
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="uuid">UUID</Label>
            <Input
              id="uuid"
              value={localFilters.uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              placeholder="Search by UUID"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Material Name</Label>
            <Input
              id="name"
              value={localFilters.name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, name: e.target.value })}
              placeholder="Search by material name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              value={localFilters.sku || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, sku: e.target.value })}
              placeholder="Search by SKU"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Material Type</Label>
            <Select
              value={localFilters.type || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, type: value === "all" ? undefined : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {materialTypes?.map(type => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="per_page">Items per page</Label>
            <Select
              value={localFilters.per_page?.toString() || "20"}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleApply} className="flex-1">
              Apply Filters
            </Button>
            <Button onClick={handleClear} variant="outline" className="flex-1">
              Clear Filters
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { MaterialFilters };