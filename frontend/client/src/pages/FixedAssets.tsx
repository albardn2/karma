import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package2 } from "lucide-react";
import { AddFixedAssetDialog } from "@/components/fixed-assets/AddFixedAssetDialog";
import { FixedAssetFilters } from "@/components/fixed-assets/FixedAssetFilters";

interface FixedAsset {
  uuid: string;
  name: string;
  description?: string;
  purchase_date?: string;
  annual_depreciation_rate: number;
  purchase_order_item_uuid?: string;
  material_uuid?: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  current_value: number;
  unit: string;
  created_by_uuid?: string;
  created_at: string;
  is_deleted: boolean;
}

interface FixedAssetPage {
  fixed_assets: FixedAsset[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface FixedAssetFilters {
  uuid?: string;
  name?: string;
  purchase_order_item_uuid?: string;
  material_uuid?: string;
  page: number;
  per_page: number;
}

export default function FixedAssets() {
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [filters, setFilters] = useState<Omit<FixedAssetFilters, 'page' | 'per_page'>>({});

  // Fetch fixed assets data
  const { data: fixedAssetData, isLoading } = useQuery<FixedAssetPage>({
    queryKey: ["/fixed-asset/", currentPage, perPage, filters],
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

      return await apiRequest(`/fixed-asset/?${params.toString()}`);
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

  const totalCount = fixedAssetData?.total_count || 0;
  const totalPages = Math.ceil(totalCount / perPage);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Fixed Assets</h1>
            <p className="text-sm text-muted-foreground">
              {totalCount} fixed {totalCount === 1 ? 'asset' : 'assets'} on this page
            </p>
          </div>
          <div className="flex items-center gap-3">
            <FixedAssetFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <AddFixedAssetDialog />
          </div>
        </div>

        <div className="space-y-6">
          {/* Fixed Assets List */}
          {fixedAssetData?.fixed_assets && fixedAssetData.fixed_assets.length > 0 ? (
            <div className="grid gap-4">
              {fixedAssetData.fixed_assets.map((asset) => (
                <Link key={asset.uuid} href={`/fixed-assets/${asset.uuid}`}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-2">
                            <h3 className="font-semibold text-lg">
                              {asset.name}
                            </h3>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              ${asset.current_value.toLocaleString()}
                            </Badge>
                            <Badge variant="secondary">
                              {asset.annual_depreciation_rate}% depreciation
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <span>Quantity: {asset.quantity} {asset.unit}</span>
                            <span>•</span>
                            <span>Purchase Price: ${asset.total_price.toLocaleString()}</span>
                            {asset.purchase_date && (
                              <>
                                <span>•</span>
                                <span>Purchased: {new Date(asset.purchase_date).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>

                          {asset.description && (
                            <p className="text-sm text-muted-foreground">
                              {asset.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-24 h-24 mb-8 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center">
                <Package2 className="h-12 w-12 text-[#5469D4]" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {Object.values(filters).some(v => v) ? "No fixed assets found" : "No fixed assets yet"}
              </h3>
              <p className="text-gray-500 mb-8 max-w-md text-center leading-relaxed">
                {Object.values(filters).some(v => v) 
                  ? "No fixed assets match your current filters. Try adjusting your search criteria." 
                  : "Get started by adding your first fixed asset to track your company's assets and depreciation."}
              </p>
              <AddFixedAssetDialog />
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * perPage) + 1} to {Math.min(currentPage * perPage, totalCount)} of {totalCount} fixed assets
              </p>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
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