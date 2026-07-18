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
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t, te } = useLanguage();
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
          <Filter className="w-4 h-4 me-2" />
          {t('common.filters')}
          {hasActiveFilters && (
            <span className="absolute -top-1 -end-1 w-3 h-3 bg-blue-600 rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{t('customers.filterCustomers')}</SheetTitle>
          <SheetDescription>
            {t('customers.filterDesc')}
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6 py-6">
          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company_name">{t('common.companyName')}</Label>
            <Input
              id="company_name"
              placeholder={t('customers.filterByCompanyName')}
              value={localFilters.company_name || ""}
              onChange={(e) => updateFilter("company_name", e.target.value)}
            />
          </div>

          {/* Contact Person */}
          <div className="space-y-2">
            <Label htmlFor="full_name">{t('customers.contactPerson')}</Label>
            <Input
              id="full_name"
              placeholder={t('customers.filterByContactPerson')}
              value={localFilters.full_name || ""}
              onChange={(e) => updateFilter("full_name", e.target.value)}
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="phone_number">{t('customers.phoneNumber')}</Label>
            <Input
              id="phone_number"
              placeholder={t('customers.filterByPhoneNumber')}
              value={localFilters.phone_number || ""}
              onChange={(e) => updateFilter("phone_number", e.target.value)}
            />
          </div>

          {/* Email Address */}
          <div className="space-y-2">
            <Label htmlFor="email_address">{t('customers.emailAddress')}</Label>
            <Input
              id="email_address"
              type="email"
              placeholder={t('customers.filterByEmailAddress')}
              value={localFilters.email_address || ""}
              onChange={(e) => updateFilter("email_address", e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">{t('common.category')}</Label>
            <Select
              value={localFilters.category || ""}
              onValueChange={(value) => updateFilter("category", value === "all" ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('customers.selectCategory')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customers.allCategories')}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category} className="capitalize">
                    {te(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customer UUID */}
          <div className="space-y-2">
            <Label htmlFor="uuid">{t('customers.customerId')}</Label>
            <Input
              id="uuid"
              placeholder={t('customers.filterByUuid')}
              value={localFilters.uuid || ""}
              onChange={(e) => updateFilter("uuid", e.target.value)}
            />
          </div>

          {/* Results per page */}
          <div className="space-y-2">
            <Label htmlFor="per_page">{t('customers.resultsPerPage')}</Label>
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
            {t('customers.applyFilters')}
          </Button>
          <Button onClick={handleClearFilters} variant="outline">
            <X className="w-4 h-4 me-2" />
            {t('customers.clear')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}