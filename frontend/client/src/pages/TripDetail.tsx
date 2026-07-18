import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Edit3, Save, X, Copy, Check, Truck, Banknote, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
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
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Trip } from "@/lib/types";
import { VehicleInventoryChart } from "@/components/vehicles/VehicleInventoryChart";
import { TripStopsMap } from "@/components/map/TripStopsMap";
import { type PlaybackPoint } from "@/components/location/LocationPlayback";
import { TripLocationMap } from "@/components/location/TripLocationMap";
import { TripAnalytics } from "@/components/trips/TripAnalytics";
import { Table as TableIcon, Map as MapIcon } from "lucide-react";

export default function TripDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { isAdmin } = useAuth();

  const deleteTripMutation = useMutation({
    mutationFn: () => apiRequest(`/trip/${params?.uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/"] });
      toast({ title: "Trip deleted" });
      setLocation("/trips");
    },
    onError: (e: Error) => {
      toast({ title: "Failed to delete trip", description: e.message, variant: "destructive" });
      setConfirmDelete(false);
    },
  });

  const { data: trip, isLoading, error } = useQuery<Trip>({
    queryKey: ["/trip/", params?.uuid],
    queryFn: () => apiRequest(`/trip/${params?.uuid}`),
    enabled: !!params?.uuid,
  });

  // material names for the inventory tables (keys are material uuids)
  const { data: materialsData } = useQuery({
    queryKey: ["/material/", "trip-detail"],
    queryFn: () => apiRequest("/material/?page=1&per_page=100"),
  });
  const materialName = (uuid: string) => {
    const m = (materialsData?.materials || []).find((m: any) => m.uuid === uuid);
    return m ? `${m.name}${m.measure_unit ? ` (${m.measure_unit})` : ""}` : uuid;
  };

  // orders / fulfillments / payments at this trip's stops
  const { data: activity } = useQuery({
    queryKey: ["/trip/", params?.uuid, "activity"],
    queryFn: () => apiRequest(`/trip/${params?.uuid}/activity`),
    enabled: !!params?.uuid,
  });
  const [activityTab, setActivityTab] = useState("orders");
  const [activityPage, setActivityPage] = useState(0);
  const PAGE_SIZE = 5;

  // recorded GPS series for this trip (admin-only endpoint; hide the section on error)
  const { data: locationData } = useQuery<{ points: PlaybackPoint[]; total_count: number }>({
    queryKey: ["/location/trip/", params?.uuid],
    queryFn: () => apiRequest(`/location/trip/${params?.uuid}`),
    enabled: !!params?.uuid,
    retry: false,
  });

  // trip stop customers: table (paginated) / animated map toggle
  const [stopsView, setStopsView] = useState<"table" | "map">("table");
  const [stopsPage, setStopsPage] = useState(0);
  const stops: any[] = activity?.stops || [];
  const stopsPageRows = stops.slice(stopsPage * PAGE_SIZE, (stopsPage + 1) * PAGE_SIZE);
  const stopsPageCount = Math.max(1, Math.ceil(stops.length / PAGE_SIZE));
  const activityRows: any[] =
    activityTab === "orders" ? activity?.orders || []
    : activityTab === "fulfillments" ? activity?.fulfillments || []
    : activity?.payments || [];
  const pageRows = activityRows.slice(activityPage * PAGE_SIZE, (activityPage + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(activityRows.length / PAGE_SIZE));

  const updateTripMutation = useMutation({
    mutationFn: async (data: { notes?: string }) => {
      return await apiRequest(`/trip/${params?.uuid}`, {
        method: "PUT",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Trip updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update trip",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    setEditedNotes(trip?.notes || "");
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    updateTripMutation.mutate({ notes: editedNotes });
  };

  const handleCancelClick = () => {
    setIsEditing(false);
    setEditedNotes("");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      return format(new Date(dateString), 'PPpp');
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-48"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !trip) {
    return (
      <AppLayout>
        <div className="p-8">
          <Button
            variant="outline"
            onClick={() => setLocation("/trips")}
            className="mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 me-2" />
            Back to trips
          </Button>
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-600">Error loading trip: {error?.message || 'Trip not found'}</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8">
        <Button
          variant="outline"
          onClick={() => setLocation("/trips")}
          className="mb-6"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 me-2" />
          Back to trips
        </Button>

        {/* Trip Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Truck className="h-8 w-8 text-gray-600" />
                <h1 className="text-3xl font-medium text-gray-900">Trip Details</h1>
              </div>
              <p className="text-gray-500" data-testid="text-header-trip-uuid">Trip UUID: {trip.uuid}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={getStatusBadgeClass(trip.status)} data-testid="badge-status">
                {formatStatus(trip.status)}
              </Badge>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                  data-testid="button-delete-trip"
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  Delete Trip
                </Button>
              )}
            </div>
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
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
                onClick={() => deleteTripMutation.mutate()}
                data-testid="button-confirm-delete-trip"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="grid gap-6 md:grid-cols-2">
          {/* General Information */}
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Trip UUID</label>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-trip-uuid">{trip.uuid}</p>
                  <button
                    onClick={() => copyToClipboard(trip.uuid, 'Trip UUID')}
                    className="p-1 hover:bg-gray-100 rounded"
                    data-testid="button-copy-uuid"
                  >
                    {copiedField === 'Trip UUID' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Vehicle UUID</label>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-vehicle-uuid">{trip.vehicle_uuid}</p>
                  <button
                    onClick={() => copyToClipboard(trip.vehicle_uuid, 'Vehicle UUID')}
                    className="p-1 hover:bg-gray-100 rounded"
                    data-testid="button-copy-vehicle-uuid"
                  >
                    {copiedField === 'Vehicle UUID' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {trip.service_area_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Service Area UUID</label>
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-service-area-uuid">{trip.service_area_uuid}</p>
                </div>
              )}

              {trip.workflow_execution_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Workflow Execution</label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-workflow-execution-uuid">{trip.workflow_execution_uuid}</p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setLocation(`/workflow-execution/${trip.workflow_execution_uuid}`)}
                      className="p-0 h-auto"
                      data-testid="button-view-workflow"
                    >
                      View
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-500">Created At</label>
                <p className="text-sm text-gray-900" data-testid="text-created-at">{formatDateTime(trip.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Timing Information */}
          <Card>
            <CardHeader>
              <CardTitle>Timing & Warehouses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Start Time</label>
                <p className="text-sm text-gray-900" data-testid="text-start-time">{formatDateTime(trip.start_time)}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">End Time</label>
                <p className="text-sm text-gray-900" data-testid="text-end-time">{formatDateTime(trip.end_time)}</p>
              </div>

              {trip.start_warehouse_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Start Warehouse</label>
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-start-warehouse-uuid">{trip.start_warehouse_uuid}</p>
                </div>
              )}

              {trip.end_warehouse_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">End Warehouse</label>
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-end-warehouse-uuid">{trip.end_warehouse_uuid}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expected cash collected at this trip's stops */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-gray-600" />
              <CardTitle>Expected Cash</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {trip.expected_cash && Object.keys(trip.expected_cash).length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {Object.entries(trip.expected_cash).map(([cur, amt]) => (
                  <div key={cur} className="border rounded-md px-4 py-2" data-testid={`expected-cash-${cur}`}>
                    <div className="text-xs text-gray-500">{cur}</div>
                    <div className="text-lg font-semibold">{Number(amt).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500" data-testid="expected-cash-empty">No cash collected on this trip yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Start/end inventory + reconciliation */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Trip Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {trip.inventory_reconciliation && Object.keys(trip.inventory_reconciliation).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trip-inventory">
                  <thead>
                    <tr className="text-start text-gray-500 border-b">
                      <th className="py-2 pe-4 font-medium">Material</th>
                      <th className="py-2 pe-4 font-medium text-end">Start</th>
                      <th className="py-2 pe-4 font-medium text-end">Sold</th>
                      <th className="py-2 pe-4 font-medium text-end">Expected End</th>
                      <th className="py-2 pe-4 font-medium text-end">End</th>
                      <th className="py-2 font-medium text-end">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(trip.inventory_reconciliation).map(([mu, r]) => (
                      <tr key={mu} className="border-b last:border-0">
                        <td className="py-2 pe-4">{materialName(mu)}</td>
                        <td className="py-2 pe-4 text-end">{r.start}</td>
                        <td className="py-2 pe-4 text-end">{r.sold}</td>
                        <td className="py-2 pe-4 text-end">{r.expected_end}</td>
                        <td className="py-2 pe-4 text-end">{r.actual_end ?? "—"}</td>
                        <td className="py-2 text-end">
                          {r.variance === null || r.variance === undefined ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <Badge variant={r.variance === 0 ? "secondary" : "destructive"}>
                              {r.variance > 0 ? `+${r.variance}` : r.variance}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!trip.end_inventory || Object.keys(trip.end_inventory).length === 0 ? (
                  <p className="text-xs text-gray-500 mt-2">
                    End inventory not snapshotted yet — End and Variance fill in when the trip completes.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-gray-500" data-testid="trip-inventory-empty">No inventory snapshot for this trip.</p>
            )}
          </CardContent>
        </Card>

        {/* Vehicle inventory over the trip window */}
        <div className="mt-6">
          <VehicleInventoryChart
            vehicleUuid={trip.vehicle_uuid}
            windowStart={trip.start_time || trip.created_at}
            windowEnd={trip.end_time}
            title="Vehicle Inventory During Trip"
          />
        </div>

        {/* Trip stop customers: sorted table / animated map */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Trip Stops</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant={stopsView === "table" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStopsView("table")}
                  data-testid="button-stops-table"
                >
                  <TableIcon className="h-4 w-4 me-2" /> Table
                </Button>
                <Button
                  variant={stopsView === "map" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStopsView("map")}
                  data-testid="button-stops-map"
                >
                  <MapIcon className="h-4 w-4 me-2" /> Map
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stops.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="trip-stops-empty">No stops on this trip yet.</p>
            ) : stopsView === "map" ? (
              <TripStopsMap stops={stops} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trip-stops">
                  <thead>
                    <tr className="text-start text-gray-500 border-b">
                      <th className="py-2 pe-4 font-medium">#</th>
                      <th className="py-2 pe-4 font-medium">Customer</th>
                      <th className="py-2 pe-4 font-medium">Status</th>
                      <th className="py-2 pe-4 font-medium">Outcome</th>
                      <th className="py-2 font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stopsPageRows.map((s: any, i: number) => (
                      <tr key={s.uuid} className="border-b last:border-0">
                        <td className="py-2 pe-4 text-gray-500">{stopsPage * PAGE_SIZE + i + 1}</td>
                        <td className="py-2 pe-4">{s.customer_name || "—"}</td>
                        <td className="py-2 pe-4">
                          <Badge variant={s.status === "completed" ? "secondary" : "outline"}>
                            {s.status || "—"}
                          </Badge>
                        </td>
                        <td className="py-2 pe-4 max-w-[240px] truncate">{s.outcome || "—"}</td>
                        <td className="py-2 whitespace-nowrap">{s.completed_at ? formatDateTime(s.completed_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stops.length > PAGE_SIZE && (
                  <div className="flex items-center justify-end gap-3 mt-3">
                    <span className="text-xs text-gray-500" data-testid="trip-stops-page-info">
                      {stopsPage * PAGE_SIZE + 1}–{Math.min((stopsPage + 1) * PAGE_SIZE, stops.length)} of {stops.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStopsPage((p) => Math.max(0, p - 1))}
                      disabled={stopsPage === 0}
                      data-testid="button-stops-prev"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStopsPage((p) => Math.min(stopsPageCount - 1, p + 1))}
                      disabled={stopsPage >= stopsPageCount - 1}
                      data-testid="button-stops-next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recorded GPS trace playback (admin-only endpoint; section hidden when it errors) */}
        {locationData && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Location Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <TripLocationMap
                tripStatus={trip.status}
                workflowExecutionUuid={trip.workflow_execution_uuid}
                points={locationData.points}
              />
            </CardContent>
          </Card>
        )}

        {/* Orders / fulfillments / payments at this trip's stops */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Trip Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activityTab}
              onValueChange={(v) => { setActivityTab(v); setActivityPage(0); }}
            >
              <TabsList data-testid="tabs-trip-activity">
                <TabsTrigger value="orders" data-testid="tab-orders">
                  Orders ({activity?.orders?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="fulfillments" data-testid="tab-fulfillments">
                  Fulfilled ({activity?.fulfillments?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="payments" data-testid="tab-payments">
                  Paid ({activity?.payments?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="analytics" data-testid="tab-analytics">
                  Analytics
                </TabsTrigger>
              </TabsList>

              <div className="mt-4">
                {activityTab === "analytics" ? (
                  <TripAnalytics activity={activity} />
                ) : pageRows.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center" data-testid="trip-activity-empty">
                    Nothing here for this trip yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-trip-activity">
                      <thead>
                        <tr className="text-start text-gray-500 border-b">
                          <th className="py-2 pe-4 font-medium">Date</th>
                          <th className="py-2 pe-4 font-medium">Customer</th>
                          {activityTab === "orders" && (
                            <>
                              <th className="py-2 pe-4 font-medium text-end">Total</th>
                              <th className="py-2 font-medium">Status</th>
                            </>
                          )}
                          {activityTab === "fulfillments" && (
                            <>
                              <th className="py-2 pe-4 font-medium">Material</th>
                              <th className="py-2 font-medium text-end">Qty</th>
                            </>
                          )}
                          {activityTab === "payments" && (
                            <th className="py-2 font-medium text-end">Amount</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r: any, i: number) => (
                          <tr
                            key={i}
                            className={cn(
                              "border-b last:border-0",
                              (r.uuid || r.customer_order_uuid) && "cursor-pointer hover:bg-gray-50"
                            )}
                            onClick={() => {
                              const target = r.uuid || r.customer_order_uuid;
                              if (target) setLocation(`/customer-orders/${target}`);
                            }}
                          >
                            <td className="py-2 pe-4 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                            <td className="py-2 pe-4">{r.customer_name || "—"}</td>
                            {activityTab === "orders" && (
                              <>
                                <td className="py-2 pe-4 text-end">{r.total} {r.currency}</td>
                                <td className="py-2">
                                  <div className="flex gap-2">
                                    <Badge variant={r.is_paid ? "secondary" : "destructive"}>
                                      {r.is_paid ? "Paid" : "Unpaid"}
                                    </Badge>
                                    <Badge variant={r.is_fulfilled ? "secondary" : "outline"}>
                                      {r.is_fulfilled ? "Fulfilled" : "Unfulfilled"}
                                    </Badge>
                                  </div>
                                </td>
                              </>
                            )}
                            {activityTab === "fulfillments" && (
                              <>
                                <td className="py-2 pe-4">{r.material_name}</td>
                                <td className="py-2 text-end">{r.quantity}</td>
                              </>
                            )}
                            {activityTab === "payments" && (
                              <td className="py-2 text-end">{r.amount} {r.currency}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* pagination */}
                {activityTab !== "analytics" && activityRows.length > PAGE_SIZE && (
                  <div className="flex items-center justify-end gap-3 mt-3">
                    <span className="text-xs text-gray-500" data-testid="trip-activity-page-info">
                      {activityPage * PAGE_SIZE + 1}–{Math.min((activityPage + 1) * PAGE_SIZE, activityRows.length)} of {activityRows.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                      disabled={activityPage === 0}
                      data-testid="button-activity-prev"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={activityPage >= pageCount - 1}
                      data-testid="button-activity-next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Notes Section */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Notes</CardTitle>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditClick}
                  data-testid="button-edit-notes"
                >
                  <Edit3 className="h-4 w-4 me-2" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-4">
                <Textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  rows={4}
                  placeholder="Enter trip notes..."
                  data-testid="input-edit-notes"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveClick}
                    disabled={updateTripMutation.isPending}
                    className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                    data-testid="button-save-notes"
                  >
                    <Save className="h-4 w-4 me-2" />
                    {updateTripMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelClick}
                    disabled={updateTripMutation.isPending}
                    data-testid="button-cancel-edit"
                  >
                    <X className="h-4 w-4 me-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-900 whitespace-pre-wrap" data-testid="text-notes">
                {trip.notes || 'No notes available'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Trip Data Section */}
        {trip.data && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Trip Data</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto" data-testid="text-trip-data">
                {JSON.stringify(trip.data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
