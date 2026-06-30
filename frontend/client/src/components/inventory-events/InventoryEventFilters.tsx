import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Filter, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface InventoryEventFilters {
  uuid?: string;
  inventory_uuid?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
}

interface InventoryEventFiltersProps {
  filters: InventoryEventFilters;
  onFiltersChange: (filters: InventoryEventFilters) => void;
  totalCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function InventoryEventFilters({ filters, onFiltersChange, totalCount, perPage, onPerPageChange }: InventoryEventFiltersProps) {
  const [localFilters, setLocalFilters] = useState<InventoryEventFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch event types from API
  const { data: eventTypes } = useQuery<string[]>({
    queryKey: ["/inventory-event/event_types"],
    queryFn: async () => {
      return await apiRequest("/inventory-event/event_types");
    },
  });

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters: InventoryEventFilters = {};
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    setIsOpen(false);
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== undefined && value !== null && value !== ""
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {hasActiveFilters && (
            <div className="absolute -top-1 -right-1 h-2 w-2 bg-[#5469D4] rounded-full" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80">
        <SheetHeader>
          <SheetTitle>Filter Inventory Events</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="uuid">UUID</Label>
              <Input
                id="uuid"
                placeholder="Enter event UUID"
                value={localFilters.uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="inventory_uuid">Inventory UUID</Label>
              <Input
                id="inventory_uuid"
                placeholder="Enter inventory UUID"
                value={localFilters.inventory_uuid || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, inventory_uuid: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="event_type">Event Type</Label>
              <Select
                value={localFilters.event_type || "all"}
                onValueChange={(value) => setLocalFilters({ ...localFilters, event_type: value === "all" ? undefined : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes?.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace('_', ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="datetime-local"
                value={localFilters.start_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, start_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="datetime-local"
                value={localFilters.end_date || ""}
                onChange={(e) => setLocalFilters({ ...localFilters, end_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="per_page">Items per page</Label>
              <Select value={String(perPage)} onValueChange={(value) => onPerPageChange(Number(value))}>
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

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {totalCount} total events
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleApplyFilters} className="flex-1 bg-[#5469D4] hover:bg-[#4356C7]">
              Apply Filters
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}