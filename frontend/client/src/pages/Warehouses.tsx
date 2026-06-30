import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Building, Mail, Phone, Calendar, Tag, MapPin, List, Map as MapIcon } from "lucide-react";
import { AddWarehouseDialog } from "@/components/warehouses/AddWarehouseDialog";
import { WarehouseFiltersComponent, type WarehouseFilters } from "@/components/warehouses/WarehouseFilters";
import { WarehouseMap } from "@/components/map/WarehouseMap";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { WarehousePage, Warehouse } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

export default function Warehouses() {
  const [filters, setFilters] = useState<WarehouseFilters>({
    page: 1,
    per_page: 20,
  });
  const [activeTab, setActiveTab] = useState("list");
  const [mapFilters, setMapFilters] = useState<WarehouseFilters>({
    page: 1,
    per_page: 100, // Higher limit for map view
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const boundsUpdateTimeoutRef = useRef<NodeJS.Timeout>();

  const buildApiUrl = (baseFilters: WarehouseFilters) => {
    const params = new URLSearchParams();
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });
    return `/warehouse/?${params.toString()}`;
  };

  // Fetch warehouses for list view with filters - ONLY when in list mode
  const { data: warehousePage, isLoading } = useQuery<WarehousePage>({
    queryKey: ["/warehouse/list", filters, activeTab], // Include activeTab in key
    queryFn: async () => {
      if (activeTab !== 'list') return { warehouses: [], total_count: 0 }; // Safety check
      const url = buildApiUrl(filters);
      return await apiRequest(url);
    },
    enabled: activeTab === 'list', // Only fetch when in list view
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Fetch warehouses for map view with bounds - ONLY when in map mode
  const { data: mapWarehousePage, isLoading: isLoadingMap } = useQuery<WarehousePage>({
    queryKey: ["/warehouse/map", mapFilters, activeTab], // Include activeTab in key
    queryFn: async () => {
      if (activeTab !== 'map') return { warehouses: [], total_count: 0 }; // Safety check
      const url = buildApiUrl(mapFilters);
      return await apiRequest(url);
    },
    enabled: activeTab === 'map', // Only fetch when in map view
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Throttled warehouse API request handler for map bounds changes
  const handleMapBoundsChange = useCallback((wktPolygon: string) => {
    if (boundsUpdateTimeoutRef.current) {
      clearTimeout(boundsUpdateTimeoutRef.current);
    }
    
    boundsUpdateTimeoutRef.current = setTimeout(() => {
      setMapFilters(prev => ({
        ...prev,
        within_polygon: wktPolygon,
      }));
    }, 1000); // 1 second throttle for API calls
  }, []);

  // Track view mode changes for map remounting
  const [mapKey, setMapKey] = useState(0);

  // Trigger initial map load when switching to map view
  const handleViewModeChange = (mode: 'list' | 'map') => {
    console.log(`Switching to ${mode} view`);
    
    // Immediately set view mode to stop all queries
    setActiveTab(mode);
    
    // Clear all cached data completely
    queryClient.clear();
    queryClient.removeQueries();
    
    if (mode === 'map') {
      // Inherit current list filters for map view
      const inheritedFilters = { ...filters, per_page: 100 };
      delete inheritedFilters.page; // Remove pagination for map
      setMapFilters(inheritedFilters);
      setMapKey(prev => prev + 1);
      console.log('Map view: inherited filters from list view', inheritedFilters);
    } else {
      // Reset list state
      setFilters({ page: 1, per_page: 20 });
      console.log('List view: cleared all data and reset filters');
    }
  };

  // Create completely isolated data states - no cross-talk
  const [displayWarehouses, setDisplayWarehouses] = useState<Warehouse[]>([]);
  const [displayCount, setDisplayCount] = useState<number>(0);
  const [displayText, setDisplayText] = useState<string>("");

  // Update display data based on current view and fresh API data
  useEffect(() => {
    if (activeTab === 'list') {
      const listWarehouses = warehousePage?.warehouses || [];
      setDisplayWarehouses(listWarehouses);
      setDisplayCount(listWarehouses.length);
      setDisplayText(isLoading ? "Loading warehouses..." : `${listWarehouses.length} warehouses on this page`);
    } else if (activeTab === 'map') {
      const mapWarehouses = mapWarehousePage?.warehouses || [];
      setDisplayWarehouses(mapWarehouses);
      setDisplayCount(mapWarehouses.length);
      setDisplayText(isLoadingMap ? "Loading warehouses in area..." : `${mapWarehouses.length} warehouses in current area`);
    }
  }, [activeTab, warehousePage, mapWarehousePage, isLoading, isLoadingMap]);

  // Reset display immediately when view changes
  useEffect(() => {
    setDisplayWarehouses([]);
    setDisplayCount(0);
    setDisplayText(activeTab === 'list' ? "Loading warehouses..." : "Loading warehouses in area...");
  }, [activeTab]);

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/warehouse/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all warehouse queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/warehouse");
        }
      });
      
      toast({
        title: "Success",
        description: "Warehouse deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete warehouse",
        variant: "destructive",
      });
    },
  });

  // Handle filter changes
  const handleFiltersChange = (newFilters: WarehouseFilters) => {
    setFilters({ ...newFilters, page: 1 });
    
    // If in map view, also update map filters to reflect the new filters
    if (activeTab === 'map') {
      const mapNewFilters = { ...newFilters, per_page: 100 };
      delete mapNewFilters.page; // Remove pagination for map
      setMapFilters(prev => ({ ...mapNewFilters, within_polygon: prev.within_polygon }));
    }
  };

  const handleClearFilters = () => {
    const clearedFilters = { page: 1, per_page: 20 };
    setFilters(clearedFilters);
    
    // If in map view, also clear map filters but keep polygon
    if (activeTab === 'map') {
      setMapFilters(prev => ({ per_page: 100, within_polygon: prev.within_polygon }));
    }
  };

  const handleDeleteWarehouse = (warehouse: Warehouse) => {
    if (window.confirm(`Are you sure you want to delete warehouse "${warehouse.name}"?`)) {
      deleteWarehouseMutation.mutate(warehouse.uuid);
    }
  };

  const currentPage = warehousePage?.page || 1;
  const totalPages = warehousePage?.pages || 1;

  if (isLoading && activeTab === "list") {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Warehouses</h1>
                <p className="text-muted-foreground">Manage your warehouse locations</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 lg:p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Warehouses</h1>
              <p className="text-muted-foreground">
                {displayText}
              </p>
            </div>
            <div className="flex gap-2">
              <WarehouseFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
              <AddWarehouseDialog />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => handleViewModeChange(value as 'list' | 'map')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                List View
              </TabsTrigger>
              <TabsTrigger value="map" className="flex items-center gap-2">
                <MapIcon className="h-4 w-4" />
                Map View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="mt-6">
              {displayWarehouses.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Building className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No warehouses found</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      {Object.keys(filters).some(key => key !== 'page' && key !== 'per_page' && filters[key as keyof WarehouseFilters])
                        ? "No warehouses match your current filters."
                        : "You haven't added any warehouses yet."}
                    </p>
                    <AddWarehouseDialog />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {displayWarehouses.map((warehouse: Warehouse) => (
                      <Card key={warehouse.uuid} className="hover:shadow-md transition-shadow cursor-pointer">
                        <Link href={`/warehouses/${warehouse.uuid}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1 flex-1">
                                <h3 className="font-semibold text-sm leading-tight">{warehouse.name}</h3>
                                <p className="text-xs text-muted-foreground line-clamp-2">{warehouse.address}</p>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            <div className="space-y-2 text-xs">
                              {warehouse.coordinates && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="text-green-600">Location available</span>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>Created {formatDate(warehouse.created_at)}</span>
                              </div>
                              
                              {warehouse.notes && (
                                <div className="flex items-start gap-1">
                                  <Tag className="h-3 w-3 mt-0.5" />
                                  <span className="line-clamp-2">{warehouse.notes}</span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Link>
                      </Card>
                    ))}
                  </div>

                  {warehousePage && warehousePage.pages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setFilters((prev: WarehouseFilters) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => setFilters((prev: WarehouseFilters) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="map" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {displayText}
                  </p>
                </div>
                
                <div className="h-[600px] rounded-lg overflow-hidden border relative z-0">
                  {isLoadingMap && (
                    <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-20">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Loading warehouses...</p>
                      </div>
                    </div>
                  )}
                  <WarehouseMap
                    key={`map-${mapKey}`} // Force remount when switching to map view
                    warehouses={displayWarehouses}
                    onBoundsChange={handleMapBoundsChange}
                    center={[33.5138, 36.2765]}
                    zoom={10}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}