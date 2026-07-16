import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Truck, Plus, Trash2 } from "lucide-react";
import { TripFilters } from "@/components/trips/TripFilters";
import { AddTripDialog } from "@/components/trips/AddTripDialog";
import { format } from "date-fns";
import type { TripPage, TripFilters as TripFiltersType } from "@/lib/types";

export default function Trips() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<TripFiltersType>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [activeTab, setActiveTab] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTargetUuid, setDeleteTargetUuid] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteTripMutation = useMutation({
    mutationFn: (uuid: string) => apiRequest(`/trip/${uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      // the paired workflow execution is soft-deleted too
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/"] });
      if (trips.length === 1 && currentPage > 1) setCurrentPage(currentPage - 1);
      toast({ title: "Trip deleted" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to delete trip", description: e.message, variant: "destructive" });
    },
    onSettled: () => setDeleteTargetUuid(null),
  });

  const {
    data: tripData,
    isLoading,
    error,
    refetch,
  } = useQuery<TripPage>({
    queryKey: ["/trip/", { ...filters, page: currentPage, per_page: perPage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", currentPage.toString());
      params.append("per_page", perPage.toString());
      
      Object.entries(filters as Record<string, any>).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, value.toString());
        }
      });
      
      const fullUrl = `/trip/?${params.toString()}`;
      const result = await apiRequest(fullUrl);
      return result;
    },
    enabled: true,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const handleFilterChange = (newFilters: Omit<TripFiltersType, 'page' | 'per_page'>) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    let newFilters: TripFiltersType = {};
    
    switch (tab) {
      case 'planned':
        newFilters = { status: 'planned' };
        break;
      case 'in_progress':
        newFilters = { status: 'in_progress' };
        break;
      case 'completed':
        newFilters = { status: 'completed' };
        break;
      case 'cancelled':
        newFilters = { status: 'cancelled' };
        break;
      default:
        newFilters = {};
    }
    
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const trips = tripData?.items || [];
  const totalCount = tripData?.total_count || 0;
  const totalPages = tripData?.pages || 0;

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-medium text-gray-900 dark:text-gray-100 mb-2">Trips</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Manage delivery and distribution trips</p>
        </div>

        {/* Tab Navigation and Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
            <button 
              onClick={() => handleTabChange('all')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'all' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              data-testid="tab-all"
            >
              All trips
            </button>
            <button 
              onClick={() => handleTabChange('planned')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'planned' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              data-testid="tab-planned"
            >
              Planned
            </button>
            <button 
              onClick={() => handleTabChange('in_progress')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'in_progress' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              data-testid="tab-in-progress"
            >
              In Progress
            </button>
            <button 
              onClick={() => handleTabChange('completed')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'completed' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              data-testid="tab-completed"
            >
              Completed
            </button>
            <button 
              onClick={() => handleTabChange('cancelled')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'cancelled' 
                  ? 'text-[#5469D4] border-b-2 border-[#5469D4]' 
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              data-testid="tab-cancelled"
            >
              Cancelled
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <TripFilters
              filters={filters}
              onFiltersChange={handleFilterChange}
              totalCount={totalCount}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
              data-testid="button-create-trip"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create trip
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Trip ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Start Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    End Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Notes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="px-6 py-16 text-center">
                      <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32 mx-auto"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-48 mx-auto"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24 mx-auto"></div>
                      </div>
                      <p className="mt-4 text-gray-500 dark:text-gray-400">Loading trips...</p>
                    </td>
                  </tr>
                ) : trips.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="px-6 py-16 text-center">
                      <Truck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {error ? "Error loading trips" : "No trips"}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-6">
                        {error ? `Error: ${error.message}` : "Get started by creating your first trip."}
                      </p>
                      {!error && (
                        <Button 
                          onClick={() => setShowAddDialog(true)}
                          className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                          data-testid="button-create-trip-empty"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create trip
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  trips.map((trip) => (
                    <tr 
                      key={trip.uuid}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setLocation(`/trip/${trip.uuid}`)}
                      data-testid={`row-trip-${trip.uuid}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                          {trip.uuid.substring(0, 8)}...
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100" data-testid={`text-trip-vehicle-${trip.uuid}`}>
                          {trip.vehicle_plate || `${trip.vehicle_uuid.substring(0, 8)}...`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100" data-testid={`text-trip-assigned-${trip.uuid}`}>
                          {trip.assigned_username || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(trip.status)}`}>
                          {formatStatus(trip.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {formatDateTime(trip.start_time)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {formatDateTime(trip.end_time)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900 dark:text-gray-100 line-clamp-1">
                          {trip.notes || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(trip.created_at), 'MMM d, yyyy')}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gray-400 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargetUuid(trip.uuid);
                            }}
                            data-testid={`button-delete-trip-${trip.uuid}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Showing <span className="font-medium">{(currentPage - 1) * perPage + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * perPage, totalCount)}</span> of{' '}
              <span className="font-medium">{totalCount}</span> results
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                data-testid="button-previous-page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Trip Dialog */}
      <AlertDialog open={!!deleteTargetUuid} onOpenChange={(open) => !open && setDeleteTargetUuid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              The trip and its workflow execution will be removed from all lists. This
              cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-trip">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteTripMutation.isPending}
              onClick={() => deleteTargetUuid && deleteTripMutation.mutate(deleteTargetUuid)}
              data-testid="button-confirm-delete-trip"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTripDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          setShowAddDialog(false);
          refetch();
        }}
      />
    </AppLayout>
  );
}
