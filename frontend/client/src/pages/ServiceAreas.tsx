import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map, MapPin, ArrowRight } from "lucide-react";
import { ServiceAreaFilters } from "@/components/service-areas/ServiceAreaFilters";
import { AddServiceAreaDialog } from "@/components/service-areas/AddServiceAreaDialog";
import { ServiceAreaMap } from "@/components/service-areas/ServiceAreaMap";

interface ServiceArea {
  uuid: string;
  created_by_uuid?: string;
  name: string;
  description?: string;
  geometry: string;
  created_at: string;
  is_deleted: boolean;
}

interface ServiceAreaPage {
  items: ServiceArea[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface ServiceAreaFilters {
  uuid?: string;
  created_by_uuid?: string;
  name?: string;
  intersects_polygon?: string;
  page: number;
  per_page: number;
}

export default function ServiceAreas() {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [filters, setFilters] = useState<Omit<ServiceAreaFilters, 'page' | 'per_page'>>({});
  const [selectedTab, setSelectedTab] = useState("list");
  const [mapKey, setMapKey] = useState(0);

  // Fetch service areas data for list view
  const { data: serviceAreaData, isLoading } = useQuery<ServiceAreaPage>({
    queryKey: ["/service-area/", currentPage, perPage, filters],
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

      return await apiRequest(`/service-area/?${params.toString()}`);
    },
    enabled: selectedTab === "list",
  });

  // Fetch service areas data for map view with current filters
  const { data: mapServiceAreaData, isLoading: isMapLoading } = useQuery<ServiceAreaPage>({
    queryKey: ["/service-area/map", filters],
    queryFn: async ({ queryKey }) => {
      const [, currentFilters] = queryKey;
      const params = new URLSearchParams({
        page: "1",
        per_page: "100", // Get items for map display
        ...(currentFilters as Record<string, string>)
      });
      
      // Remove empty values
      Object.keys(currentFilters as Record<string, string>).forEach(key => {
        if (!(currentFilters as Record<string, string>)[key]) {
          params.delete(key);
        }
      });

      return await apiRequest(`/service-area/?${params.toString()}`);
    },
    enabled: selectedTab === "map",
    staleTime: 0,
  });

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleTabChange = (tab: string) => {
    setSelectedTab(tab);
    if (tab === "map") {
      // Force map remount when switching to map view
      setMapKey(prev => prev + 1);
    }
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

  const totalCount = serviceAreaData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  if (isLoading && selectedTab === "list") {
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

  const serviceAreas = serviceAreaData?.items || [];
  const mapServiceAreas = mapServiceAreaData?.items || [];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Service Areas</h1>
            <p className="text-muted-foreground">
              {selectedTab === "list" 
                ? serviceAreaData ? `${serviceAreaData.total_count} areas` : "Loading..."
                : mapServiceAreaData ? `${mapServiceAreaData.total_count} areas` : "Loading..."
              }
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ServiceAreaFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={selectedTab === "list" ? (serviceAreaData?.total_count || 0) : (mapServiceAreaData?.total_count || 0)}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <AddServiceAreaDialog />
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {serviceAreas.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6] mx-auto mb-4">
                  <Map className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No service areas found</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {Object.values(filters).some(value => value && value !== "")
                    ? "No service areas match your current filters. Try adjusting your search criteria." 
                    : "Get started by adding your first service area to define coverage regions."}
                </p>
                <AddServiceAreaDialog />
              </div>
            ) : (
              <>
                {serviceAreas.map((area) => (
                  <Link key={area.uuid} href={`/service-areas/${area.uuid}`}>
                    <Card className="hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-[#5469D4]/20">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-3 flex-1">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6]">
                                <Map className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-lg">{area.name}</h3>
                                <p className="text-sm text-muted-foreground">Area ID: {area.uuid}</p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Created By</p>
                                <p className="text-sm">{area.created_by_uuid || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Created At</p>
                                <p className="text-sm">{new Date(area.created_at).toLocaleDateString()}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Status</p>
                                <Badge variant={area.is_deleted ? "destructive" : "default"}>
                                  {area.is_deleted ? "Deleted" : "Active"}
                                </Badge>
                              </div>
                            </div>

                            {area.description && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Description</p>
                                <p className="text-sm">{area.description}</p>
                              </div>
                            )}
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
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        Last
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * perPage) + 1} to {Math.min(currentPage * perPage, totalCount)} of {totalCount} areas
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="map" className="space-y-4">
            <div className="h-[600px] rounded-lg border overflow-hidden">
              {isMapLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : (
                <ServiceAreaMap
                  key={`service-area-map-${mapKey}`}
                  serviceAreas={mapServiceAreas}
                  filters={filters}
                  onFiltersChange={handleFilterChange}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}