import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PricingFilters {
  uuid?: string;
  material_uuid?: string;
  currency?: string;
}

interface PricingFiltersProps {
  filters: PricingFilters;
  onFiltersChange: (filters: PricingFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function PricingFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: PricingFiltersProps) {
  const [localFilters, setLocalFilters] = useState<PricingFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch currencies from API
  const { data: currencies } = useQuery<string[]>({
    queryKey: ["/payment/currencies"],
    queryFn: async () => {
      return await apiRequest("/payment/currencies");
    },
  });

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: PricingFilters = {
      uuid: "",
      material_uuid: "",
      currency: "",
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
          <SheetTitle>Filter Pricing</SheetTitle>
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
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={localFilters.currency || "all"}
                  onValueChange={(value) => setLocalFilters({ 
                    ...localFilters, 
                    currency: value === "all" ? "" : value 
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Currencies</SelectItem>
                    {currencies?.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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