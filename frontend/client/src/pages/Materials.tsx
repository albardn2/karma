import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Package, DollarSign, Hash, Calendar, User } from "lucide-react";
import { AddMaterialDialog } from "@/components/materials/AddMaterialDialog";
import { MaterialFiltersComponent, type MaterialFilters } from "@/components/materials/MaterialFilters";
import { apiRequest } from "@/lib/queryClient";
import type { MaterialPage, Material } from "@/lib/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Link } from "wouter";

export default function Materials() {
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [filters, setFilters] = useState<MaterialFilters>({
    page: 1,
    per_page: 20,
  });

  // Fetch material types for tabs
  const { data: materialTypes } = useQuery<string[]>({
    queryKey: ["/material/material-type"],
    queryFn: async () => {
      return await apiRequest("/material/material-type");
    },
  });

  const buildApiUrl = (baseFilters: MaterialFilters) => {
    const params = new URLSearchParams();
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });
    return `/material/?${params.toString()}`;
  };

  // Fetch materials for list view with filters
  const { data: materialPage, isLoading } = useQuery<MaterialPage>({
    queryKey: ["/material/list", filters],
    queryFn: async () => {
      const url = buildApiUrl(filters);
      return await apiRequest(url);
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Handle filter changes
  const handleFiltersChange = (newFilters: MaterialFilters) => {
    setFilters({ ...newFilters, page: 1 });
    // Update selected tab based on type filter
    if (newFilters.type) {
      setSelectedTab(newFilters.type);
    } else {
      setSelectedTab("all");
    }
  };

  // Handle tab changes
  const handleTabChange = (tabValue: string) => {
    setSelectedTab(tabValue);
    const newFilters: MaterialFilters = {
      ...filters,
      type: tabValue === "all" ? undefined : tabValue,
      page: 1,
    };
    setFilters(newFilters);
  };

  const currentPage = materialPage?.page || 1;
  const totalPages = materialPage?.pages || 1;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Materials</h1>
                <p className="text-muted-foreground">Manage your material inventory</p>
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
              <h1 className="text-2xl font-bold">Materials</h1>
              <p className="text-muted-foreground">
                {materialPage?.materials ? `${materialPage.materials.length} materials on this page` : "Loading materials..."}
              </p>
            </div>
            <div className="flex gap-2">
              <MaterialFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
              <AddMaterialDialog />
            </div>
          </div>

          {/* Material Type Tabs */}
          <Tabs value={selectedTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full auto-cols-max grid-flow-col overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">
                All Materials
              </TabsTrigger>
              {materialTypes?.map(type => (
                <TabsTrigger key={type} value={type} className="whitespace-nowrap">
                  {type.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {materialPage?.materials && materialPage.materials.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {materialPage.materials.map((material) => (
                  <Link key={material.uuid} href={`/materials/${material.uuid}`}>
                    <Card className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-semibold leading-none">{material.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{material.uuid.slice(0, 8)}...</span>
                            </div>
                          </div>
                          {material.category && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              {material.category}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <span>SKU: {material.sku}</span>
                          </div>
                          {material.measure_unit && (
                            <div className="flex items-center gap-2 text-sm">
                              <Hash className="h-3 w-3 text-muted-foreground" />
                              <span>Unit: {material.measure_unit}</span>
                            </div>
                          )}
                          {material.description && (
                            <div className="text-sm text-muted-foreground">
                              <span className="line-clamp-2">{material.description}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Created {formatDate(material.created_at)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, page: currentPage - 1 }))}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 me-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, page: currentPage + 1 }))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ms-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No materials found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Get started by creating your first material record.
                </p>
                <AddMaterialDialog />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}