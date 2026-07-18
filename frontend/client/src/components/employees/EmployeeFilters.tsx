import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { EmployeeFilters, EmployeeRole } from "@/lib/types";

const EMPLOYEE_ROLES = [
  { value: "admin", labelKey: "employees.roleAdmin" },
  { value: "manager", labelKey: "employees.roleManager" },
  { value: "employee", labelKey: "employees.roleOperator" },
  { value: "accountant", labelKey: "employees.roleAccountant" },
  { value: "driver", labelKey: "employees.roleDriver" },
  { value: "sales", labelKey: "employees.roleSales" }
];

interface EmployeeFiltersComponentProps {
  filters: EmployeeFilters;
  onFiltersChange: (filters: EmployeeFilters) => void;
}

export function EmployeeFiltersComponent({ filters, onFiltersChange }: EmployeeFiltersComponentProps) {
  const [localFilters, setLocalFilters] = useState<EmployeeFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

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
          {t('common.filters')}
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-2 py-1 ms-2">
              {Object.keys(filters).filter(key => key !== 'page' && key !== 'per_page' && filters[key as keyof EmployeeFilters]).length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>{t('employees.filterTitle')}</SheetTitle>
          <SheetDescription>
            {t('employees.filterDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="uuid">{t('employees.uuid')}</Label>
            <Input
              id="uuid"
              value={localFilters.uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              placeholder={t('employees.searchByUuid')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">{t('common.fullName')}</Label>
            <Input
              id="full_name"
              value={localFilters.full_name || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, full_name: e.target.value })}
              placeholder={t('employees.searchByName')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">{t('employees.phoneNumber')}</Label>
            <Input
              id="phone_number"
              value={localFilters.phone_number || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, phone_number: e.target.value })}
              placeholder={t('employees.searchByPhone')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_address">{t('employees.emailAddress')}</Label>
            <Input
              id="email_address"
              value={localFilters.email_address || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, email_address: e.target.value })}
              placeholder={t('employees.searchByEmail')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t('employees.role')}</Label>
            <Select
              value={localFilters.role || "all"}
              onValueChange={(value: string) => setLocalFilters({ ...localFilters, role: value === "all" ? undefined : value as EmployeeRole })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('employees.selectRole')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('employees.allRoles')}</SelectItem>
                {EMPLOYEE_ROLES.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    {t(role.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="per_page">{t('employees.itemsPerPage')}</Label>
            <Select
              value={localFilters.per_page?.toString() || "20"}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('employees.itemsPerPage')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{t('employees.perPageOption', { count: 10 })}</SelectItem>
                <SelectItem value="20">{t('employees.perPageOption', { count: 20 })}</SelectItem>
                <SelectItem value="50">{t('employees.perPageOption', { count: 50 })}</SelectItem>
                <SelectItem value="100">{t('employees.perPageOption', { count: 100 })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleApply} className="flex-1">
              {t('employees.applyFilters')}
            </Button>
            <Button onClick={handleClear} variant="outline" className="flex-1">
              {t('common.clearFilters')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type { EmployeeFilters };