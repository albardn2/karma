import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import type { TripFilters as TripFiltersType, TripFilterOptions } from "@/lib/types";

interface TripFiltersProps {
  filters: Omit<TripFiltersType, 'page' | 'per_page'>;
  onFiltersChange: (filters: Omit<TripFiltersType, 'page' | 'per_page'>) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function TripFilters({
  filters,
  onFiltersChange,
  totalCount,
  perPage,
  onPerPageChange,
}: TripFiltersProps) {
  const { t, te } = useLanguage();
  const [localFilters, setLocalFilters] = useState(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Only the people and vehicles that are on at least one trip, so every choice
  // finds something. Under the "/trip/" key prefix on purpose: creating or
  // deleting a trip already invalidates ["/trip/"], which refreshes these too.
  const {
    data: options,
    isLoading: optionsLoading,
    isError: optionsFailed,
  } = useQuery<TripFilterOptions>({
    queryKey: ["/trip/", "filter-options"],
    queryFn: () => apiRequest("/trip/filter-options"),
  });
  const assignees = options?.assignees ?? [];
  const vehicles = options?.vehicles ?? [];
  // A chosen value can outlive its option (its last trip deleted since). Keep it
  // selectable rather than leaving an active filter with a blank box.
  const orphanAssignee =
    localFilters.assigned_user_uuid &&
    !assignees.some((a) => a.uuid === localFilters.assigned_user_uuid)
      ? localFilters.assigned_user_uuid
      : null;
  const orphanVehicle =
    localFilters.vehicle_uuid && !vehicles.some((v) => v.uuid === localFilters.vehicle_uuid)
      ? localFilters.vehicle_uuid
      : null;

  useEffect(() => {
    setLocalFilters({
      uuid: filters.uuid || undefined,
      vehicle_uuid: filters.vehicle_uuid || undefined,
      assigned_user_uuid: filters.assigned_user_uuid || undefined,
      service_area_uuid: filters.service_area_uuid || undefined,
      status: filters.status || undefined,
      // NOT `|| undefined` like the others: is_audited is a boolean, and false
      // ("not audited") is a real selection that `||` would silently drop back
      // to "all" on the next render.
      is_audited: filters.is_audited,
    });
  }, [filters]);

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    const clearedFilters = {};
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.keys(filters).some(
    key => filters[key as keyof typeof filters] !== undefined && 
           filters[key as keyof typeof filters] !== null &&
           filters[key as keyof typeof filters] !== ''
  );

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-gray-600 dark:text-gray-400">{t('trips.showLabel')}</Label>
        <Select
          value={perPage.toString()}
          onValueChange={(value) => onPerPageChange(parseInt(value))}
        >
          <SelectTrigger className="w-[100px]" data-testid="select-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {t('common.of')} {totalCount}
        </span>
      </div>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            className="gap-2"
            data-testid="button-filters"
          >
            <Filter className="h-4 w-4" />
            {t('common.filters')}
            {hasActiveFilters && (
              <span className="ms-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#5469D4] text-xs text-white">
                {Object.keys(filters).filter(key => 
                  filters[key as keyof typeof filters] !== undefined &&
                  filters[key as keyof typeof filters] !== null &&
                  filters[key as keyof typeof filters] !== ''
                ).length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-sm mb-3">{t('trips.filterTitle')}</h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="filter-uuid" className="text-sm">{t('trips.tripUuid')}</Label>
                <Input
                  id="filter-uuid"
                  placeholder={t('trips.enterTripUuid')}
                  value={localFilters.uuid || ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value || undefined })}
                  data-testid="input-filter-uuid"
                />
              </div>

              {/* 'all' is the same sentinel as the status filter below: Radix
                  Select cannot hold an empty value, and it converts back to
                  undefined so the param is simply left off. */}
              <div>
                <Label htmlFor="filter-assignee" className="text-sm">{t('trips.filterAssignee')}</Label>
                <Select
                  value={localFilters.assigned_user_uuid || 'all'}
                  onValueChange={(value) => setLocalFilters({
                    ...localFilters,
                    assigned_user_uuid: value === 'all' ? undefined : value,
                  })}
                  disabled={optionsLoading}
                >
                  <SelectTrigger id="filter-assignee" data-testid="select-filter-assignee">
                    <SelectValue placeholder={t('trips.allAssignees')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('trips.allAssignees')}</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.uuid} value={a.uuid} data-testid={`option-assignee-${a.username}`}>
                        {a.name}
                        {a.name !== a.username && (
                          <span className="ms-1 text-gray-500 dark:text-gray-400">· {a.username}</span>
                        )}
                      </SelectItem>
                    ))}
                    {orphanAssignee && (
                      <SelectItem value={orphanAssignee}>{orphanAssignee}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filter-vehicle" className="text-sm">{t('trips.filterVehicle')}</Label>
                <Select
                  value={localFilters.vehicle_uuid || 'all'}
                  onValueChange={(value) => setLocalFilters({
                    ...localFilters,
                    vehicle_uuid: value === 'all' ? undefined : value,
                  })}
                  disabled={optionsLoading}
                >
                  <SelectTrigger id="filter-vehicle" data-testid="select-filter-vehicle">
                    <SelectValue placeholder={t('trips.allVehicles')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('trips.allVehicles')}</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.uuid} value={v.uuid} data-testid={`option-vehicle-${v.plate_number}`}>
                        {v.plate_number}
                      </SelectItem>
                    ))}
                    {orphanVehicle && (
                      <SelectItem value={orphanVehicle}>{orphanVehicle}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {optionsFailed && (
                <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-filter-options-failed">
                  {t('trips.filterOptionsFailed')}
                </p>
              )}

              <div>
                <Label htmlFor="filter-service-area" className="text-sm">{t('trips.serviceAreaUuid')}</Label>
                <Input
                  id="filter-service-area"
                  placeholder={t('trips.enterServiceAreaUuid')}
                  value={localFilters.service_area_uuid || ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, service_area_uuid: e.target.value || undefined })}
                  data-testid="input-filter-service-area"
                />
              </div>

              <div>
                <Label htmlFor="filter-status" className="text-sm">{t('common.status')}</Label>
                <Select
                  value={localFilters.status || 'all'}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, status: value === 'all' ? undefined : value as any })}
                >
                  <SelectTrigger id="filter-status" data-testid="select-filter-status">
                    <SelectValue placeholder={t('trips.selectStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('trips.allStatuses')}</SelectItem>
                    <SelectItem value="planned">{te('planned')}</SelectItem>
                    <SelectItem value="in_progress">{te('in_progress')}</SelectItem>
                    <SelectItem value="completed">{te('completed')}</SelectItem>
                    <SelectItem value="cancelled">{te('cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filter-audited" className="text-sm">{t('trips.auditLabel')}</Label>
                {/* 'all' is a sentinel, as with the status filter above: Radix
                    Select cannot hold an empty string value, and an empty
                    is_audited would 422 the endpoint. It converts back to
                    undefined so the param is simply omitted. */}
                <Select
                  value={localFilters.is_audited === undefined ? 'all' : String(localFilters.is_audited)}
                  onValueChange={(value) => setLocalFilters({
                    ...localFilters,
                    is_audited: value === 'all' ? undefined : value === 'true',
                  })}
                >
                  <SelectTrigger id="filter-audited" data-testid="select-filter-audited">
                    <SelectValue placeholder={t('trips.selectAuditState')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('trips.allAuditStates')}</SelectItem>
                    <SelectItem value="true">{t('trips.audited')}</SelectItem>
                    <SelectItem value="false">{t('trips.notAudited')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClear}
                data-testid="button-clear-filters"
              >
                {t('trips.clear')}
              </Button>
              <Button
                className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
                onClick={handleApply}
                data-testid="button-apply-filters"
              >
                {t('common.apply')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
