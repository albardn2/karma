import { useState, useEffect } from "react";
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
import type { TripFilters as TripFiltersType } from "@/lib/types";

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
  const [localFilters, setLocalFilters] = useState(filters);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setLocalFilters({
      uuid: filters.uuid || undefined,
      vehicle_uuid: filters.vehicle_uuid || undefined,
      service_area_uuid: filters.service_area_uuid || undefined,
      status: filters.status || undefined,
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
        <Label className="text-sm text-gray-600 dark:text-gray-400">Show:</Label>
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
          of {totalCount}
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
            Filters
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
              <h3 className="font-medium text-sm mb-3">Filter trips</h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="filter-uuid" className="text-sm">Trip UUID</Label>
                <Input
                  id="filter-uuid"
                  placeholder="Enter trip UUID"
                  value={localFilters.uuid || ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value || undefined })}
                  data-testid="input-filter-uuid"
                />
              </div>

              <div>
                <Label htmlFor="filter-vehicle" className="text-sm">Vehicle UUID</Label>
                <Input
                  id="filter-vehicle"
                  placeholder="Enter vehicle UUID"
                  value={localFilters.vehicle_uuid || ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, vehicle_uuid: e.target.value || undefined })}
                  data-testid="input-filter-vehicle"
                />
              </div>

              <div>
                <Label htmlFor="filter-service-area" className="text-sm">Service Area UUID</Label>
                <Input
                  id="filter-service-area"
                  placeholder="Enter service area UUID"
                  value={localFilters.service_area_uuid || ''}
                  onChange={(e) => setLocalFilters({ ...localFilters, service_area_uuid: e.target.value || undefined })}
                  data-testid="input-filter-service-area"
                />
              </div>

              <div>
                <Label htmlFor="filter-status" className="text-sm">Status</Label>
                <Select
                  value={localFilters.status || 'all'}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, status: value === 'all' ? undefined : value as any })}
                >
                  <SelectTrigger id="filter-status" data-testid="select-filter-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
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
                Clear
              </Button>
              <Button
                className="flex-1 bg-[#5469D4] hover:bg-[#4356C7] text-white"
                onClick={handleApply}
                data-testid="button-apply-filters"
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
