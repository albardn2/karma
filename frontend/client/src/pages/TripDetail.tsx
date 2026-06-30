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
import { ArrowLeft, Edit3, Save, X, Copy, Check, Truck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Trip } from "@/lib/types";

export default function TripDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: trip, isLoading, error } = useQuery<Trip>({
    queryKey: ["/trip/", params?.uuid],
    queryFn: () => apiRequest(`/trip/${params?.uuid}`),
    enabled: !!params?.uuid,
  });

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
            <ArrowLeft className="h-4 w-4 mr-2" />
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
          <ArrowLeft className="h-4 w-4 mr-2" />
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
            <Badge className={getStatusBadgeClass(trip.status)} data-testid="badge-status">
              {formatStatus(trip.status)}
            </Badge>
          </div>
        </div>

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
                  <Edit3 className="h-4 w-4 mr-2" />
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
                    <Save className="h-4 w-4 mr-2" />
                    {updateTripMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelClick}
                    disabled={updateTripMutation.isPending}
                    data-testid="button-cancel-edit"
                  >
                    <X className="h-4 w-4 mr-2" />
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
