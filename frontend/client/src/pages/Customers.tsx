import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, List, Map } from "lucide-react";
import { AddCustomerDialog } from "@/components/customers/AddCustomerDialog";
import { CustomerFiltersComponent, type CustomerFilters } from "@/components/customers/CustomerFilters";
import { CustomerMap } from "@/components/map/CustomerMap";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Customer, CustomerPage } from "@/lib/types";

export default function Customers() {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<CustomerFilters>({
    page: 1,
    per_page: 20,
  });
  const throttleRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Build query params for API call
  const buildApiUrl = (baseFilters: CustomerFilters) => {
    const params = new URLSearchParams();
    
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });
    
    return `/customer/?${params.toString()}`;
  };

  // Separate state for map customers
  const [mapFilters, setMapFilters] = useState<CustomerFilters>({
    per_page: 100, // Get more customers for map view
  });

  // Fetch customers for list view with filters - ONLY when in list mode
  const { data: customersData, isLoading } = useQuery<CustomerPage>({
    queryKey: ["/customer/list", filters, viewMode], // Include viewMode in key
    queryFn: async () => {
      if (viewMode !== 'list') return { customers: [], pages: 0, total: 0 }; // Safety check
      const url = buildApiUrl(filters);
      console.log('Fetching customers for list view:', url);
      return await apiRequest(url);
    },
    enabled: viewMode === 'list', // Only fetch when in list view
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Fetch customers for map view with bounds - ONLY when in map mode
  const { data: mapCustomersData, isLoading: isMapLoading } = useQuery<CustomerPage>({
    queryKey: ["/customer/map", mapFilters, viewMode], // Include viewMode in key
    queryFn: async () => {
      if (viewMode !== 'map') return { customers: [], pages: 0, total: 0 }; // Safety check
      const url = buildApiUrl(mapFilters);
      console.log('Fetching customers for map view:', url);
      return await apiRequest(url);
    },
    enabled: viewMode === 'map', // Only fetch when in map view
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache data
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Fetch customer categories
  const { data: categories } = useQuery<string[]>({
    queryKey: ["/customer/categories"],
  });

  // Handle filter changes
  const handleFiltersChange = (newFilters: CustomerFilters) => {
    setFilters({ ...newFilters, page: 1 });
    
    // If in map view, also update map filters to reflect the new filters
    if (viewMode === 'map') {
      const mapNewFilters = { ...newFilters, per_page: 100 };
      delete mapNewFilters.page; // Remove pagination for map
      setMapFilters(prev => ({ ...mapNewFilters, within_polygon: prev.within_polygon }));
    }
  };

  const handleClearFilters = () => {
    setFilters({ page: 1, per_page: 20 });
    
    // If in map view, also clear map filters but keep polygon
    if (viewMode === 'map') {
      setMapFilters(prev => ({ per_page: 100, within_polygon: prev.within_polygon }));
    }
  };

  // Throttled customer API request handler for map bounds changes
  const handleMapBoundsChange = useCallback((wktPolygon: string) => {
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
    }
    
    throttleRef.current = setTimeout(() => {
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
    setViewMode(mode);
    
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
      setFilters({ per_page: 12 });
      console.log('List view: cleared all data and reset filters');
    }
  };

  // Create completely isolated data states - no cross-talk
  const [displayCustomers, setDisplayCustomers] = useState<Customer[]>([]);
  const [displayCount, setDisplayCount] = useState<number>(0);
  const [displayText, setDisplayText] = useState<string>("");

  // Update display data based on current view and fresh API data
  useEffect(() => {
    if (viewMode === 'list') {
      const listCustomers = customersData?.customers || [];
      setDisplayCustomers(listCustomers);
      setDisplayCount(listCustomers.length);
      setDisplayText(isLoading ? "Loading customers..." : `${listCustomers.length} customers on this page`);
    } else if (viewMode === 'map') {
      const mapCustomers = mapCustomersData?.customers || [];
      setDisplayCustomers(mapCustomers);
      setDisplayCount(mapCustomers.length);
      setDisplayText(isMapLoading ? "Loading customers in area..." : `${mapCustomers.length} customers in current area`);
    }
  }, [viewMode, customersData, mapCustomersData, isLoading, isMapLoading]);

  // Reset display immediately when view changes
  useEffect(() => {
    setDisplayCustomers([]);
    setDisplayCount(0);
    setDisplayText(viewMode === 'list' ? "Loading customers..." : "Loading customers in area...");
  }, [viewMode]);

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (uuid: string) => {
      await apiRequest(`/customer/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all customer queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/customer");
        }
      });
      
      // Also refetch any active queries immediately
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/customer");
        }
      });
      
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  const handleDeleteCustomer = (uuid: string, companyName: string) => {
    if (confirm(`Are you sure you want to delete ${companyName}? This action cannot be undone.`)) {
      deleteCustomerMutation.mutate(uuid);
    }
  };

  if (isLoading && viewMode === 'list') {
    return (
      <AppLayout>
        <div className="flex-1 p-6">
          <div className="animate-pulse space-y-6">
            <div className="flex justify-between items-center">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="h-10 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
          </div>
          <AddCustomerDialog categories={categories || []} />
        </div>

        {/* Total Customers Banner */}
        {(displayCount > 0 || isLoading || isMapLoading) ? (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg px-4 py-3">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-indigo-500 rounded-full me-3"></div>
                <span className="text-sm font-medium text-indigo-900">
                  {displayText}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* View Toggle and Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4 relative z-10">
          {/* View Toggle */}
          <div className="flex items-center space-x-2 rtl:space-x-reverse bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('list')}
              className={viewMode === 'list' ? 'brand-gradient' : ''}
            >
              <List className="w-4 h-4 me-2" />
              List
            </Button>
            <Button
              variant={viewMode === 'map' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('map')}
              className={viewMode === 'map' ? 'brand-gradient' : ''}
            >
              <Map className="w-4 h-4 me-2" />
              Map
            </Button>
          </div>

          {/* Filters */}
          <div className="relative z-10">
            <CustomerFiltersComponent
              filters={filters}
              categories={categories || []}
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
            />
          </div>
        </div>

        {/* Content Area */}
        {viewMode === 'list' ? (
          /* Customer List View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayCustomers.map((customer: Customer) => (
              <Card 
                key={customer.uuid} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setLocation(`/customers/${customer.uuid}`)}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {customer.company_name}
                      </h3>
                      <p className="text-sm text-gray-600">{customer.full_name}</p>
                    </div>
                    <Badge variant="secondary" className="ms-2 capitalize">
                      {customer.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">Contact</p>
                    <p className="text-sm text-gray-900">{customer.phone_number}</p>
                    {customer.email_address && (
                      <p className="text-sm text-gray-600">{customer.email_address}</p>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="text-sm text-gray-900 line-clamp-2">{customer.full_address}</p>
                  </div>

                  {customer.notes && (
                    <div>
                      <p className="text-xs text-gray-500">Notes</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{customer.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* Customer Map View */
          <div className="h-[600px] rounded-lg overflow-hidden border relative z-0">
            {isMapLoading && (
              <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading customers...</p>
                </div>
              </div>
            )}
            <CustomerMap
              key={`map-${mapKey}`} // Force remount when switching to map view
              customers={displayCustomers}
              onBoundsChange={handleMapBoundsChange}
              center={[33.5138, 36.2765]}
              zoom={10}
            />
          </div>
        )}

        {viewMode === 'list' && displayCount === 0 && !isLoading && (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No customers found</h3>
            <p className="text-gray-600 mb-4">
              {Object.keys(filters).some(key => key !== 'page' && key !== 'per_page' && filters[key as keyof CustomerFilters])
                ? "Try adjusting your filters" 
                : "Get started by adding your first customer"}
            </p>
            <AddCustomerDialog categories={categories || []} />
          </div>
        )}
        
        {viewMode === 'map' && displayCount === 0 && !isMapLoading && (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No customers found in this area</h3>
            <p className="text-gray-600 mb-4">
              Pan and zoom the map to explore different areas, or add your first customer.
            </p>
            <AddCustomerDialog categories={categories || []} />
          </div>
        )}

        {/* Pagination - Only show for list view */}
        {viewMode === 'list' && customersData && customersData.pages > 1 && (
          <div className="flex justify-center items-center space-x-4 rtl:space-x-reverse mt-8">
            <Button
              variant="outline"
              disabled={filters.page === 1}
              onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {filters.page || 1} of {customersData.pages}
            </span>
            <Button
              variant="outline"
              disabled={filters.page === customersData.pages}
              onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
