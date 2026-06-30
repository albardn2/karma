import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import type { VendorFilters, VendorCategory } from "@/lib/types";

const VENDOR_CATEGORIES = [
  { value: "raw_materials", label: "Raw Materials" },
  { value: "equipment", label: "Equipment" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" }
];

interface VendorFiltersProps {
  filters: VendorFilters;
  onFiltersChange: (filters: VendorFilters) => void;
}

export function VendorFiltersComponent({ filters, onFiltersChange }: VendorFiltersProps) {
  const [localFilters, setLocalFilters] = useState<VendorFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onFiltersChange({ ...localFilters, page: 1 });
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: VendorFilters = { page: 1, per_page: filters.per_page };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof VendorFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 h-2 w-2 rounded-full bg-blue-600" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filter Vendors</SheetTitle>
          <SheetDescription>
            Use the filters below to narrow down the vendor list.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="uuid">UUID</Label>
            <Input
              id="uuid"
              value={localFilters.uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value || undefined })}
              placeholder="Search by UUID..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              value={localFilters.company_name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, company_name: e.target.value || undefined })}
              placeholder="Search by company name..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={localFilters.full_name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, full_name: e.target.value || undefined })}
              placeholder="Search by full name..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_address">Email</Label>
            <Input
              id="email_address"
              value={localFilters.email_address || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, email_address: e.target.value || undefined })}
              placeholder="Search by email..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              value={localFilters.phone_number || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, phone_number: e.target.value || undefined })}
              placeholder="Search by phone..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={localFilters.category || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, category: value === "all" ? undefined : value as VendorCategory })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {VENDOR_CATEGORIES.map(category => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
          <Button onClick={handleClear} variant="outline" className="flex-1">
            Clear All
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { VendorFilters };