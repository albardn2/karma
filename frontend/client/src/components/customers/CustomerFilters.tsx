import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X } from "lucide-react";

export interface CustomerFilters {
  uuid?: string;
  category?: string;
  email_address?: string;
  company_name?: string;
  full_name?: string;
  phone_number?: string;
  within_polygon?: string;
  page?: number;
  per_page?: number;
}

interface CustomerFiltersProps {
  filters: CustomerFilters;
  categories: string[];
  onFiltersChange: (filters: CustomerFilters) => void;
  onClearFilters: () => void;
}

export function CustomerFiltersComponent({
  filters,
  categories,
  onFiltersChange,
  onClearFilters,
}: CustomerFiltersProps) {
  const [localFilters, setLocalFilters] = useState<CustomerFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = { page: 1, per_page: 20 };
    setLocalFilters(clearedFilters);
    onClearFilters();
    setIsOpen(false);
  };

  const updateFilter = (key: keyof CustomerFilters, value: any) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = Object.keys(filters).some(key => 
    key !== 'page' && key !== 'per_page' && filters[key as keyof CustomerFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="w-4 h-4 mr-2" />
          Filters
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Filter Customers</SheetTitle>
          <SheetDescription>
            Apply specific filters to find customers by their details
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6 py-6">
          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              placeholder="Filter by company name..."
              value={localFilters.company_name || ""}
              onChange={(e) => updateFilter("company_name", e.target.value)}
            />
          </div>

          {/* Contact Person */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Contact Person</Label>
            <Input
              id="full_name"
              placeholder="Filter by contact person..."
              value={localFilters.full_name || ""}
              onChange={(e) => updateFilter("full_name", e.target.value)}
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              placeholder="Filter by phone number..."
              value={localFilters.phone_number || ""}
              onChange={(e) => updateFilter("phone_number", e.target.value)}
            />
          </div>

          {/* Email Address */}
          <div className="space-y-2">
            <Label htmlFor="email_address">Email Address</Label>
            <Input
              id="email_address"
              type="email"
              placeholder="Filter by email address..."
              value={localFilters.email_address || ""}
              onChange={(e) => updateFilter("email_address", e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={localFilters.category || ""}
              onValueChange={(value) => updateFilter("category", value === "all" ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category} className="capitalize">
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer UUID */}
          <div className="space-y-2">
            <Label htmlFor="uuid">Customer ID</Label>
            <Input
              id="uuid"
              placeholder="Filter by customer UUID..."
              value={localFilters.uuid || ""}
              onChange={(e) => updateFilter("uuid", e.target.value)}
            />
          </div>

          {/* Results per page */}
          <div className="space-y-2">
            <Label htmlFor="per_page">Results per page</Label>
            <Select
              value={localFilters.per_page?.toString() || "20"}
              onValueChange={(value) => updateFilter("per_page", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 pt-6">
          <Button onClick={handleApplyFilters} className="flex-1 brand-gradient">
            Apply Filters
          </Button>
          <Button onClick={handleClearFilters} variant="outline">
            <X className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}