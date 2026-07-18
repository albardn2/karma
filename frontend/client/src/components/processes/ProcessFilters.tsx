import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { ProcessType } from "@/types/process";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";

interface ProcessFiltersProps {
  filters: {
    uuid?: string;
    type?: ProcessType;
    start_date?: string;
    end_date?: string;
    created_by_uuid?: string;
    per_page: number;
  };
  onFiltersChange: (filters: any) => void;
}

export function ProcessFilters({ filters, onFiltersChange }: ProcessFiltersProps) {
  const { t, te } = useLanguage();
  const [localFilters, setLocalFilters] = useState(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch process types
  const { data: processTypes } = useQuery({
    queryKey: ["/process/types"],
    queryFn: () => apiRequest("/process/types"),
  });

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      uuid: "",
      type: undefined,
      start_date: "",
      end_date: "",
      created_by_uuid: "",
      per_page: 20,
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const getFilterCount = () => {
    let count = 0;
    if (filters.uuid) count++;
    if (filters.type) count++;
    if (filters.start_date) count++;
    if (filters.end_date) count++;
    if (filters.created_by_uuid) count++;
    return count;
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="h-4 w-4 me-2" />
          {t('common.filter')}
          {getFilterCount() > 0 && (
            <Badge variant="secondary" className="ms-2 h-5 w-5 p-0 flex items-center justify-center">
              {getFilterCount()}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] z-[9999]">
        <SheetHeader>
          <SheetTitle>{t('processes.filterTitle')}</SheetTitle>
          <SheetDescription>
            {t('processes.filterDesc')}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="uuid">{t('processes.uuid')}</Label>
            <Input
              id="uuid"
              placeholder={t('processes.uuidPlaceholder')}
              value={localFilters.uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="type">{t('processes.processType')}</Label>
            <Select
              value={localFilters.type || "all"}
              onValueChange={(value) => setLocalFilters({ 
                ...localFilters, 
                type: value === "all" ? undefined : value as ProcessType 
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('processes.selectType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('processes.allTypes')}</SelectItem>
                {processTypes?.map((type: string) => (
                  <SelectItem key={type} value={type}>
                    {te(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="start_date">{t('processes.startDate')}</Label>
            <Input
              id="start_date"
              type="datetime-local"
              value={localFilters.start_date || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, start_date: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="end_date">{t('processes.endDate')}</Label>
            <Input
              id="end_date"
              type="datetime-local"
              value={localFilters.end_date || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, end_date: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="created_by_uuid">{t('processes.createdByUuid')}</Label>
            <Input
              id="created_by_uuid"
              placeholder={t('processes.creatorUuidPlaceholder')}
              value={localFilters.created_by_uuid || ""}
              onChange={(e) => setLocalFilters({ ...localFilters, created_by_uuid: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="per_page">{t('common.perPage')}</Label>
            <Select
              value={localFilters.per_page.toString()}
              onValueChange={(value) => setLocalFilters({ ...localFilters, per_page: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex gap-2 mt-6">
          <Button onClick={handleApplyFilters} className="flex-1">
            {t('processes.applyFilters')}
          </Button>
          <Button variant="outline" onClick={handleClearFilters} className="flex-1">
            <X className="h-4 w-4 me-2" />
            {t('processes.clear')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}