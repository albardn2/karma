import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Eye, MoreVertical, CreditCard } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PayoutFilters } from "@/components/payouts/PayoutFilters";
import { format } from "date-fns";

interface Payout {
  uuid: string;
  created_by_uuid?: string;
  purchase_order_uuid?: string;
  expense_uuid?: string;
  amount: number;
  currency: string;
  notes?: string;
  employee_uuid?: string;
  credit_note_item_uuid?: string;
  financial_account_uuid: string;
  created_at: string;
  is_deleted: boolean;
}

interface PayoutPage {
  payouts: Payout[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface PayoutFiltersType {
  uuid?: string;
  credit_note_item_uuid?: string;
  purchase_order_uuid?: string;
  expense_uuid?: string;
  employee_uuid?: string;
  page: number;
  per_page: number;
}

export default function Payouts() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [filters, setFilters] = useState<PayoutFiltersType>({
    page: 1,
    per_page: 20,
  });

  const { data: payoutPage, isLoading, error } = useQuery({
    queryKey: ["/payout/", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      return apiRequest(`/payout/?${params.toString()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (uuid: string) => apiRequest(`/payout/${uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/payout/"] });
      toast({
        title: "Success",
        description: "Payout deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payout",
        variant: "destructive",
      });
    },
  });

  const payouts = payoutPage?.payouts || [];
  const totalCount = payoutPage?.total_count || 0;
  const currentPage = payoutPage?.page || 1;
  const totalPages = payoutPage?.pages || 1;

  const handleFilterChange = (newFilters: Partial<PayoutFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleDelete = (uuid: string) => {
    if (window.confirm("Are you sure you want to delete this payout?")) {
      deleteMutation.mutate(uuid);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    const currencySymbols: { [key: string]: string } = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CAD': 'C$',
      'AUD': 'A$',
      'CHF': 'CHF ',
      'CNY': '¥',
      'INR': '₹',
    };
    
    const symbol = currencySymbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="text-center py-8">
            <p className="text-red-600">Error loading payouts: {error.message}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100">
              Payouts
            </h1>
          </div>
          <Button
            onClick={() => setLocation("/payouts/create")}
            className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Payout
          </Button>
        </div>

        {/* Filters */}
        <PayoutFilters 
          filters={filters} 
          onFilterChange={handleFilterChange}
          totalCount={totalCount}
          perPage={filters.per_page}
          onPerPageChange={(perPage) => setFilters(prev => ({ ...prev, per_page: perPage, page: 1 }))}
        />

        {/* Payouts Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payouts.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No payouts found</p>
                <Button
                  onClick={() => setLocation("/payouts/create")}
                  className="mt-4 bg-[#5469D4] hover:bg-[#4356C7] text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Payout
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference UUID</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => {
                      const getPayoutType = () => {
                        if (payout.purchase_order_uuid) return { type: "Purchase Order", uuid: payout.purchase_order_uuid };
                        if (payout.expense_uuid) return { type: "Expense", uuid: payout.expense_uuid };
                        if (payout.employee_uuid) return { type: "Employee", uuid: payout.employee_uuid };
                        if (payout.credit_note_item_uuid) return { type: "Credit Note", uuid: payout.credit_note_item_uuid };
                        return { type: "Unknown", uuid: "" };
                      };

                      const payoutType = getPayoutType();

                      return (
                        <TableRow key={payout.uuid} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                          <TableCell onClick={() => setLocation(`/payouts/${payout.uuid}`)}>
                            <div className="font-medium">
                              {formatCurrency(payout.amount, payout.currency)}
                            </div>
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/payouts/${payout.uuid}`)}>
                            <Badge variant="outline" className="text-xs">
                              {payoutType.type}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/payouts/${payout.uuid}`)}>
                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                              {payoutType.uuid.substring(0, 8)}...
                            </span>
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/payouts/${payout.uuid}`)}>
                            {format(new Date(payout.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/payouts/${payout.uuid}`)}>
                            <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px] block">
                              {payout.notes || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setLocation(`/payouts/${payout.uuid}`)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(payout.uuid)}
                                  className="text-red-600"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Showing {(currentPage - 1) * filters.per_page + 1} to {Math.min(currentPage * filters.per_page, totalCount)} of {totalCount} payouts
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded">
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
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}