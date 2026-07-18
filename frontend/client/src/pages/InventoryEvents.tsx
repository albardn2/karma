import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { Calendar, Package, ArrowRight } from "lucide-react";
import { InventoryEventFilters } from "@/components/inventory-events/InventoryEventFilters";
import { AddInventoryEventDialog } from "@/components/inventory-events/AddInventoryEventDialog";
import { useLanguage } from "@/contexts/LanguageContext";

interface InventoryEvent {
  uuid: string;
  inventory_uuid: string;
  material_uuid: string;
  material_name?: string | null;
  event_type: string;
  quantity: number;
  notes?: string;
  cost_per_unit?: number;
  currency?: string;
  affect_original: boolean;
  created_at: string;
  is_deleted: boolean;
}

interface InventoryEventPage {
  events: InventoryEvent[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface InventoryEventFilters {
  uuid?: string;
  inventory_uuid?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  page: number;
  per_page: number;
}

export default function InventoryEvents() {
  const { t, te } = useLanguage();
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [filters, setFilters] = useState<Omit<InventoryEventFilters, 'page' | 'per_page'>>({});

  // Fetch inventory events data
  const { data: inventoryEventData, isLoading } = useQuery<InventoryEventPage>({
    queryKey: ["/inventory-event/", currentPage, perPage, filters],
    queryFn: async ({ queryKey }) => {
      const [, page, per_page, currentFilters] = queryKey;
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(per_page),
        ...(currentFilters as Record<string, string>)
      });
      
      // Remove empty values
      Object.keys(currentFilters as Record<string, string>).forEach(key => {
        if (!(currentFilters as Record<string, string>)[key]) {
          params.delete(key);
        }
      });

      return await apiRequest(`/inventory-event/?${params.toString()}`);
    },
  });

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1); // Reset to first page when changing per page
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCount = inventoryEventData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  const events = inventoryEventData?.events || [];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('nav.inventoryEvents')}</h1>
            <p className="text-muted-foreground">
              {inventoryEventData ? t('inventoryEvents.countEvents', { count: inventoryEventData.total_count }) : t('common.loading')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <InventoryEventFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={inventoryEventData?.total_count || 0}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <AddInventoryEventDialog />
          </div>
        </div>

        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="text-center py-12">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6] mx-auto mb-4">
                <Calendar className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t('inventoryEvents.emptyTitle')}</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {Object.values(filters).some(value => value && value !== "")
                  ? t('inventoryEvents.emptyFiltered')
                  : t('inventoryEvents.emptyDefault')}
              </p>
              <AddInventoryEventDialog />
            </div>
          ) : (
            <>
              {events.map((event) => (
                <Link key={event.uuid} href={`/inventory-events/${event.uuid}`}>
                  <Card className="hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-[#5469D4]/20">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6]">
                              <Calendar className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg">{te(event.event_type)}</h3>
                              <p className="text-sm text-muted-foreground">{t('inventoryEvents.eventId', { id: event.uuid })}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.material')}</p>
                              <p className="text-sm" data-testid={`text-event-material-${event.uuid}`}>
                                {event.material_name || event.material_uuid}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">{t('common.quantity')}</p>
                              <p className="text-sm">{event.quantity}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.costPerUnit')}</p>
                              <p className="text-sm">{event.cost_per_unit ? `${event.cost_per_unit} ${event.currency || ''}` : t('inventoryEvents.notAvailable')}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">{t('inventoryEvents.affectsOriginal')}</p>
                              <Badge variant={event.affect_original ? "default" : "secondary"}>
                                {event.affect_original ? t('common.yes') : t('common.no')}
                              </Badge>
                            </div>
                          </div>

                          {event.notes && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">{t('common.notes')}</p>
                              <p className="text-sm">{event.notes}</p>
                            </div>
                          )}

                          <div>
                            <p className="text-sm font-medium text-muted-foreground">{t('common.createdAt')}</p>
                            <p className="text-sm">{new Date(event.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ms-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                    >
                      {t('inventoryEvents.first')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      {t('common.previous')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {t('inventoryEvents.pageOf', { page: currentPage, pages: totalPages })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      {t('common.next')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      {t('inventoryEvents.last')}
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('inventoryEvents.showingEvents', { from: ((currentPage - 1) * perPage) + 1, to: Math.min(currentPage * perPage, totalCount), total: totalCount })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}