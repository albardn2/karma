import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Building2, Mail, Phone, Calendar, Tag, MapPin, List, Map as MapIcon } from "lucide-react";
import { AddVendorDialog } from "@/components/vendors/AddVendorDialog";
import { VendorFiltersComponent, type VendorFilters } from "@/components/vendors/VendorFilters";
import { VendorMap } from "@/components/map/VendorMap";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { VendorPage, Vendor } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

const VENDOR_CATEGORY_LABELS = {
  raw_materials: "Raw Materials",
  equipment: "Equipment", 
  services: "Services",
  other: "Other"
};

const VENDOR_CATEGORY_COLORS = {
  raw_materials: "bg-green-100 text-green-800",
  equipment: "bg-blue-100 text-blue-800",
  services: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-800"
};



export default function Vendors() {
  const [filters, setFilters] = useState<VendorFilters>({
    page: 1,
    per_page: 20,
  });
  const [activeTab, setActiveTab] = useState("list");
  const [mapFilters, setMapFilters] = useState<VendorFilters>({
    page: 1,
    per_page: 100, // Higher limit for map view
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const boundsUpdateTimeoutRef = useRef<NodeJS.Timeout>();

  const buildApiUrl = (baseFilters: VendorFilters) => {
    const params = new URLSearchParams();
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });
    return `/vendor/?${params.toString()}`;
  };

  // Fetch vendors for list view with filters - ONLY when in list mode
  const { data: vendorPage, isLoading } = useQuery<VendorPage>({
    queryKey: ["/vendor/list", filters, activeTab], // Include activeTab in key
    queryFn: async () => {
      if (activeTab !== 'list') return { vendors: [], total_count: 0 }; // Safety check
      const url = buildApiUrl(filters);
      return await apiRequest(url);
    },
    enabled: activeTab === 'list', // Only fetch when in list view
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Fetch vendors for map view with bounds - ONLY when in map mode
  const { data: mapVendorPage, isLoading: isLoadingMap } = useQuery<VendorPage>({
    queryKey: ["/vendor/map", mapFilters, activeTab], // Include activeTab in key
    queryFn: async () => {
      if (activeTab !== 'map') return { vendors: [], total_count: 0 }; // Safety check
      const url = buildApiUrl(mapFilters);
      return await apiRequest(url);
    },
    enabled: activeTab === 'map', // Only fetch when in map view
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Throttled vendor API request handler for map bounds changes
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
  const [displayVendors, setDisplayVendors] = useState<Vendor[]>([]);
  const [displayCount, setDisplayCount] = useState<number>(0);
  const [displayText, setDisplayText] = useState<string>("");

  // Update display data based on current view and fresh API data
  useEffect(() => {
    if (activeTab === 'list') {
      const listVendors = vendorPage?.vendors || [];
      setDisplayVendors(listVendors);
      setDisplayCount(listVendors.length);
      setDisplayText(isLoading ? "Loading vendors..." : `${listVendors.length} vendors on this page`);
    } else if (activeTab === 'map') {
      const mapVendors = mapVendorPage?.vendors || [];
      setDisplayVendors(mapVendors);
      setDisplayCount(mapVendors.length);
      setDisplayText(isLoadingMap ? "Loading vendors in area..." : `${mapVendors.length} vendors in current area`);
    }
  }, [activeTab, vendorPage, mapVendorPage, isLoading, isLoadingMap]);

  // Reset display immediately when view changes
  useEffect(() => {
    setDisplayVendors([]);
    setDisplayCount(0);
    setDisplayText(activeTab === 'list' ? "Loading vendors..." : "Loading vendors in area...");
  }, [activeTab]);

  // Direct bounds change handler for WKT polygon data
  const handleBoundsChange = useCallback((wktPolygon: string) => {
    handleMapBoundsChange(wktPolygon);
  }, [handleMapBoundsChange]);



  const deleteVendorMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/vendor/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        query.queryKey[0] === "/vendor" 
      });
      toast({
        title: "Success",
        description: "Vendor deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vendor",
        variant: "destructive",
      });
    },
  });

  const handleFiltersChange = (newFilters: VendorFilters) => {
    setFilters(newFilters);
    
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

  const handleDeleteVendor = (vendor: Vendor) => {
    if (window.confirm(`Are you sure you want to delete vendor "${vendor.company_name}"?`)) {
      deleteVendorMutation.mutate(vendor.uuid);
    }
  };

  const currentPage = vendorPage?.page || 1;
  const totalPages = vendorPage?.pages || 1;

  if (isLoading && activeTab === "list") {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Vendors</h1>
                <p className="text-muted-foreground">Manage your vendor relationships</p>
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
              <h1 className="text-2xl font-bold">Vendors</h1>
              <p className="text-muted-foreground">
                {displayText}
              </p>
            </div>
            <div className="flex gap-2">
              <VendorFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
              <AddVendorDialog />
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
              {displayVendors.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No vendors found</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      {Object.keys(filters).some(key => key !== 'page' && key !== 'per_page' && filters[key as keyof VendorFilters])
                        ? "No vendors match your current filters."
                        : "You haven't added any vendors yet."}
                    </p>
                    <AddVendorDialog />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {displayVendors.map((vendor: Vendor) => (
                      <Card key={vendor.uuid} className="hover:shadow-md transition-shadow cursor-pointer">
                        <Link href={`/vendors/${vendor.uuid}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1 flex-1">
                                <h3 className="font-semibold text-sm leading-tight">{vendor.company_name}</h3>
                                <p className="text-xs text-muted-foreground">{vendor.full_name}</p>
                              </div>
                              <div className="flex gap-1 ms-2">
                                {vendor.category && (
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-xs px-1.5 py-0.5 ${VENDOR_CATEGORY_COLORS[vendor.category]}`}
                                  >
                                    {VENDOR_CATEGORY_LABELS[vendor.category]}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Phone className="h-3 w-3" />
                                <span>{vendor.phone_number}</span>
                              </div>
                              
                              {vendor.email_address && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Mail className="h-3 w-3" />
                                  <span>{vendor.email_address}</span>
                                </div>
                              )}
                              
                              {vendor.full_address && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{vendor.full_address}</span>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(vendor.created_at)}</span>
                              </div>

                              {Object.keys(vendor.balance_per_currency).length > 0 && (
                                <div className="pt-2 border-t">
                                  <div className="text-xs text-muted-foreground mb-1">Balance:</div>
                                  {Object.entries(vendor.balance_per_currency).map(([currency, balance]) => (
                                    <div key={currency} className="text-xs">
                                      {currency}: {balance}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Link>
                      </Card>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setFilters((prev: VendorFilters) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => setFilters((prev: VendorFilters) => ({ ...prev, page: (prev.page || 1) + 1 }))}
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
                        <p className="text-sm text-gray-600">Loading vendors...</p>
                      </div>
                    </div>
                  )}
                  <VendorMap
                    key={`map-${mapKey}`} // Force remount when switching to map view
                    vendors={displayVendors}
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