import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Filter } from "lucide-react";
import { PermissionScope, type UserFilters } from "@/lib/types";

interface UserFiltersComponentProps {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
  onClearFilters: () => void;
}

export function UserFiltersComponent({ 
  filters, 
  onFiltersChange, 
  onClearFilters 
}: UserFiltersComponentProps) {
  const [localFilters, setLocalFilters] = useState<UserFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = { page: 1, per_page: 12 };
    setLocalFilters(clearedFilters);
    onClearFilters();
    setIsOpen(false);
  };

  const updateFilter = (key: keyof UserFilters, value: any) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof UserFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="w-4 h-4 me-2" />
          Filters
          {hasActiveFilters && (
            <span className="absolute -top-1 -end-1 w-3 h-3 bg-blue-600 rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Filter Users</SheetTitle>
          <SheetDescription>
            Apply specific filters to find users by their details
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6 py-6">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Filter by username..."
              value={localFilters.username || ""}
              onChange={(e) => updateFilter("username", e.target.value)}
            />
          </div>

          {/* UUID */}
          <div className="space-y-2">
            <Label htmlFor="uuid">UUID</Label>
            <Input
              id="uuid"
              placeholder="Filter by UUID..."
              value={localFilters.uuid || ""}
              onChange={(e) => updateFilter("uuid", e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="Filter by email..."
              value={localFilters.email || ""}
              onChange={(e) => updateFilter("email", e.target.value)}
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

          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              placeholder="Filter by first name..."
              value={localFilters.first_name || ""}
              onChange={(e) => updateFilter("first_name", e.target.value)}
            />
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              placeholder="Filter by last name..."
              value={localFilters.last_name || ""}
              onChange={(e) => updateFilter("last_name", e.target.value)}
            />
          </div>

          {/* Permission Scope */}
          <div className="space-y-2">
            <Label htmlFor="permission_scope">Permission Scope</Label>
            <Select 
              value={localFilters.permission_scope || "all"} 
              onValueChange={(value) => updateFilter("permission_scope", value === "all" ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select permission..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Permissions</SelectItem>
                {Object.values(PermissionScope).map((scope) => (
                  <SelectItem key={scope} value={scope}>
                    {scope.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results per page */}
          <div className="space-y-2">
            <Label htmlFor="per_page">Results per page</Label>
            <Select
              value={localFilters.per_page?.toString() || "12"}
              onValueChange={(value) => updateFilter("per_page", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="12">12</SelectItem>
                <SelectItem value="24">24</SelectItem>
                <SelectItem value="48">48</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Button onClick={handleApplyFilters} className="flex-1">
            Apply Filters
          </Button>
          <Button 
            variant="outline" 
            onClick={handleClearFilters}
            className="flex-1"
          >
            Clear All
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}