import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Users, Mail, Phone, Calendar, User, MoreHorizontal } from "lucide-react";
import { AddEmployeeDialog } from "@/components/employees/AddEmployeeDialog";
import { EmployeeFiltersComponent, type EmployeeFilters } from "@/components/employees/EmployeeFilters";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { EmployeePage, Employee } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

const EMPLOYEE_ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager", 
  employee: "Operator",
  accountant: "Accountant",
  driver: "Driver",
  sales: "Sales"
};

const EMPLOYEE_ROLE_COLORS = {
  admin: "bg-red-100 text-red-800",
  manager: "bg-blue-100 text-blue-800",
  employee: "bg-green-100 text-green-800",
  accountant: "bg-purple-100 text-purple-800",
  driver: "bg-orange-100 text-orange-800",
  sales: "bg-indigo-100 text-indigo-800"
};

export default function Employees() {
  const [filters, setFilters] = useState<EmployeeFilters>({
    page: 1,
    per_page: 20,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const buildApiUrl = (baseFilters: EmployeeFilters) => {
    const params = new URLSearchParams();
    Object.entries(baseFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value.toString());
      }
    });
    return `/employee/?${params.toString()}`;
  };

  // Fetch employees for list view with filters
  const { data: employeePage, isLoading } = useQuery<EmployeePage>({
    queryKey: ["/employee/list", filters],
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
  const handleFiltersChange = (newFilters: EmployeeFilters) => {
    setFilters({ ...newFilters, page: 1 });
  };

  const handleClearFilters = () => {
    setFilters({ page: 1, per_page: 20 });
  };

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (uuid: string) => {
      return await apiRequest(`/employee/${uuid}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all employee queries to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/employee");
        }
      });
      
      toast({
        title: "Success",
        description: "Employee deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete employee",
        variant: "destructive",
      });
    },
  });

  const handleDeleteEmployee = (employee: Employee) => {
    if (window.confirm(`Are you sure you want to delete employee "${employee.full_name}"?`)) {
      deleteEmployeeMutation.mutate(employee.uuid);
    }
  };

  const currentPage = employeePage?.page || 1;
  const totalPages = employeePage?.pages || 1;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Employees</h1>
                <p className="text-muted-foreground">Manage your employee records</p>
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
              <h1 className="text-2xl font-bold">Employees</h1>
              <p className="text-muted-foreground">
                {employeePage?.employees ? `${employeePage.employees.length} employees on this page` : "Loading employees..."}
              </p>
            </div>
            <div className="flex gap-2">
              <EmployeeFiltersComponent filters={filters} onFiltersChange={handleFiltersChange} />
              <AddEmployeeDialog />
            </div>
          </div>

          {employeePage?.employees && employeePage.employees.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {employeePage.employees.map((employee) => (
                  <Link key={employee.uuid} href={`/employees/${employee.uuid}`}>
                    <Card className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-semibold leading-none">{employee.full_name}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="h-3 w-3" />
                              <span>{employee.uuid.slice(0, 8)}...</span>
                            </div>
                          </div>
                          {employee.role && (
                            <Badge 
                              variant="secondary" 
                              className={EMPLOYEE_ROLE_COLORS[employee.role]}
                            >
                              {EMPLOYEE_ROLE_LABELS[employee.role]}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{employee.phone_number}</span>
                          </div>
                          {employee.email_address && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate">{employee.email_address}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Created {formatDate(employee.created_at)}</span>
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
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, page: currentPage + 1 }))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No employees found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Get started by creating your first employee record.
                </p>
                <AddEmployeeDialog />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}