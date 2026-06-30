import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLayout } from "@/components/layout/AppLayout";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { AddInventoryDialog } from "@/components/inventory/AddInventoryDialog";
import { Package, Building } from "lucide-react";

interface Inventory {
  uuid: string;
  material_uuid: string;
  warehouse_uuid: string | null;
  created_by_uuid: string | null;
  notes: string | null;
  lot_id: string | null;
  expiration_date: string | null;
  cost_per_unit: number | null;
  unit: string;
  current_quantity: number | null;
  original_quantity: number | null;
  is_active: boolean;
  currency: string | null;
  created_at: string;
  is_deleted: boolean;
  total_original_cost: number | null;
}

interface InventoryPage {
  inventories: Inventory[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface InventoryFilters {
  uuid?: string;
  material_uuid?: string;
  warehouse_uuid?: string;
  is_active?: boolean;
  currency?: string;
  page: number;
  per_page: number;
}

export default function Inventory() {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [filters, setFilters] = useState<Omit<InventoryFilters, 'page' | 'per_page'>>({});

  // Fetch inventory data
  const { data: inventoryData, isLoading, error } = useQuery<InventoryPage>({
    queryKey: ["/inventory/", currentPage, perPage, filters],
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

      return await apiRequest(`/inventory/?${params.toString()}`);
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

  const totalCount = inventoryData?.total_count || 0;
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

  const inventories = inventoryData?.inventories || [];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
            <p className="text-muted-foreground mt-1">
              Showing {inventories.length} of {totalCount} inventory items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <InventoryFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <AddInventoryDialog />
          </div>
        </div>

        <div className="space-y-4">
          {inventories.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6] mb-4">
                <Package className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No inventory items found</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {Object.values(filters).some(value => value && value !== "")
                  ? "No inventory items match your current filters. Try adjusting your search criteria." 
                  : "Get started by adding your first inventory item to track materials and stock levels."}
              </p>
              <AddInventoryDialog />
            </div>
          ) : (
            <>
              {inventories.map((inventory) => (
                <Link key={inventory.uuid} href={`/inventory/${inventory.uuid}`}>
                  <Card className="hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-[#5469D4]/20">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-[#5469D4] via-[#6B73E0] to-[#8B5CF6]">
                              <Package className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg">{inventory.material_uuid}</h3>
                              <p className="text-sm text-muted-foreground">Material UUID: {inventory.material_uuid}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Current Quantity</p>
                              <p className="text-sm">{inventory.current_quantity || 'N/A'} {inventory.unit}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Original Quantity</p>
                              <p className="text-sm">{inventory.original_quantity || 'N/A'} {inventory.unit}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Cost per Unit</p>
                              <p className="text-sm">{inventory.cost_per_unit ? `${inventory.cost_per_unit} ${inventory.currency || ''}` : 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Warehouse</p>
                              <p className="text-sm">{inventory.warehouse_uuid || 'N/A'}</p>
                            </div>
                          </div>

                          {inventory.lot_id && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Lot ID</p>
                              <p className="text-sm">{inventory.lot_id}</p>
                            </div>
                          )}

                          {inventory.expiration_date && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Expiration Date</p>
                              <p className="text-sm">{new Date(inventory.expiration_date).toLocaleDateString()}</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={inventory.is_active ? "default" : "secondary"}>
                            {inventory.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Created: {new Date(inventory.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * perPage) + 1} to {Math.min(currentPage * perPage, totalCount)} of {totalCount} inventory items
              </p>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage <= 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Page</span>
                  <span className="text-sm font-medium">{currentPage}</span>
                  <span className="text-sm">of</span>
                  <span className="text-sm font-medium">{totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage >= totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}