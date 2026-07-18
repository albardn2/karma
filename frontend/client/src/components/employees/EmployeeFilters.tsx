import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import type { EmployeeFilters, EmployeeRole } from "@/lib/types";

const EMPLOYEE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Operator" },
  { value: "accountant", label: "Accountant" },
  { value: "driver", label: "Driver" },
  { value: "sales", label: "Sales" }
];

interface EmployeeFiltersComponentProps {
  filters: EmployeeFilters;
  onFiltersChange: (filters: EmployeeFilters) => void;
}

export function EmployeeFiltersComponent({ filters, onFiltersChange }: EmployeeFiltersComponentProps) {
  const [localFilters, setLocalFilters] = useState<EmployeeFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onFiltersChange({ ...localFilters, page: 1 });
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters: EmployeeFilters = { page: 1, per_page: filters.per_page };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== 'page' && key !== 'per_page' && filters[key as keyof EmployeeFilters]
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-2 py-1 ms-2">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof EmployeeFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Filter Employees</SheetTitle>
          <SheetDescription>
            Apply filters to narrow down the employee list
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
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={localFilters.full_name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, full_name: e.target.value })}
              placeholder="Search by full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              value={localFilters.phone_number || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, phone_number: e.target.value })}
              placeholder="Search by phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_address">Email Address</Label>
            <Input
              id="email_address"
              value={localFilters.email_address || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, email_address: e.target.value })}
              placeholder="Search by email address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={localFilters.role || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, role: value === "all" ? undefined : value as EmployeeRole })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {EMPLOYEE_ROLES.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
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

export type { EmployeeFilters };