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
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { t, te } = useLanguage();
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
          {t("common.filters")}
          {hasActiveFilters && (
            <span className="absolute -top-1 -end-1 w-3 h-3 bg-blue-600 rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{t("users.filterUsers")}</SheetTitle>
          <SheetDescription>
            {t("users.filterUsersDesc")}
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6 py-6">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">{t("common.username")}</Label>
            <Input
              id="username"
              placeholder={t("users.filterByUsername")}
              value={localFilters.username || ""}
              onChange={(e) => updateFilter("username", e.target.value)}
            />
          </div>

          {/* UUID */}
          <div className="space-y-2">
            <Label htmlFor="uuid">{t("users.uuid")}</Label>
            <Input
              id="uuid"
              placeholder={t("users.filterByUuid")}
              value={localFilters.uuid || ""}
              onChange={(e) => updateFilter("uuid", e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input
              id="email"
              placeholder={t("users.filterByEmail")}
              value={localFilters.email || ""}
              onChange={(e) => updateFilter("email", e.target.value)}
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="phone_number">{t("users.phoneNumber")}</Label>
            <Input
              id="phone_number"
              placeholder={t("users.filterByPhone")}
              value={localFilters.phone_number || ""}
              onChange={(e) => updateFilter("phone_number", e.target.value)}
            />
          </div>

          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="first_name">{t("users.firstName")}</Label>
            <Input
              id="first_name"
              placeholder={t("users.filterByFirstName")}
              value={localFilters.first_name || ""}
              onChange={(e) => updateFilter("first_name", e.target.value)}
            />
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label htmlFor="last_name">{t("users.lastName")}</Label>
            <Input
              id="last_name"
              placeholder={t("users.filterByLastName")}
              value={localFilters.last_name || ""}
              onChange={(e) => updateFilter("last_name", e.target.value)}
            />
          </div>

          {/* Permission Scope */}
          <div className="space-y-2">
            <Label htmlFor="permission_scope">{t("users.permissionScope")}</Label>
            <Select
              value={localFilters.permission_scope || "all"}
              onValueChange={(value) => updateFilter("permission_scope", value === "all" ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("users.selectPermission")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("users.allPermissions")}</SelectItem>
                {Object.values(PermissionScope).map((scope) => (
                  <SelectItem key={scope} value={scope}>
                    {te(scope)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results per page */}
          <div className="space-y-2">
            <Label htmlFor="per_page">{t("users.resultsPerPage")}</Label>
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
            {t("users.applyFilters")}
          </Button>
          <Button
            variant="outline"
            onClick={handleClearFilters}
            className="flex-1"
          >
            {t("users.clearAll")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}