import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Edit3, Save, X, Copy, Check, Truck, Banknote, ChevronLeft, ChevronRight, Trash2, Receipt, ClipboardCheck, Clock, Undo2 } from "lucide-react";
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
import { useLanguage } from "@/contexts/LanguageContext";
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

// apiRequest throws Error("<status>: <raw body>") and the backend error body is
// {"error": ...}, or {"msg": ...} from the permission layer. Dig the readable
// sentence out so a refused sign-off reads as "Only a supervisor can audit a
// trip…" instead of '403: {"error": "..."}'. Same helper as ExchangeRates.tsx,
// duplicated because that one is a module-local const there, not an export.
const apiErrorMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const body = raw.slice(raw.indexOf(":") + 1).trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string") return parsed.error;
    if (parsed && typeof parsed.msg === "string") return parsed.msg;
  } catch {
    // not JSON — fall through
  }
  return fallback || raw;
};

// Roles allowed to sign a trip off, mirroring the backend's AUDITOR_SCOPES
// (app/entrypoint/routes/trip/routes.py). Admins are handled separately via
// useAuth().isAdmin, exactly as the handler's _require_auditor() does.
const AUDITOR_SCOPES = ["operation_manager", "accountant"];

// audited_at arrives NAIVE — "2026-07-28T12:58:51.392508", no offset — and is
// UTC. new Date() reads a naive datetime as LOCAL time, so a sign-off stamped at
// 23:40 UTC would render as that same evening instead of after midnight in the
// viewer's zone, i.e. a day out. Append 'Z' when no offset is present so it
// parses as UTC and date-fns renders it locally. Same spirit as
// ExchangeRates.tsx's formatRateDate: parse explicitly rather than trusting
// new Date() with an ambiguous string.
const parseNaiveUtc = (ts: string): Date =>
  new Date(ts.includes("T") && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(ts) ? `${ts}Z` : ts);

export default function TripDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [editedName, setEditedName] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { user, isAdmin } = useAuth();
  const { t, te } = useLanguage();

  // Who may sign a trip off: admins, plus the supervisory roles. The backend
  // enforces this inside the handler (the ACL gate keys on blueprint+method, and
  // `trip: create` is held by drivers and salespeople too), so gate on the role
  // here rather than on an endpoint grant — otherwise a driver would be shown a
  // button that always 403s. permission_scope is the comma-separated scope
  // string /auth/me returns; this is the same derivation AuthContext uses for
  // isAdmin.
  const scopes = (user?.permission_scope ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const canAudit = isAdmin || scopes.some((s) => AUDITOR_SCOPES.includes(s));

  const deleteTripMutation = useMutation({
    mutationFn: () => apiRequest(`/trip/${params?.uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/"] });
      toast({ title: t("trips.tripDeleted") });
      setLocation("/trips");
    },
    onError: (e: Error) => {
      toast({ title: t("trips.failedDelete"), description: e.message, variant: "destructive" });
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

  // costs booked against this trip; the cash table needs every currency that
  // appears in either collections or spend, since a trip can collect in one and
  // spend in another
  const { data: expensePage } = useQuery<any>({
    queryKey: ["/expense/", "trip", params?.uuid],
    queryFn: () => apiRequest(`/expense/?trip_uuid=${params?.uuid}&per_page=100`),
    enabled: !!params?.uuid,
  });
  const tripExpenses: any[] = expensePage?.expenses || [];
  const cashCurrencies = Array.from(
    new Set([
      ...Object.keys(trip?.expected_cash || {}),
      ...Object.keys(trip?.trip_expenses || {}),
    ])
  ).sort();
  // a cost booked to the trip but never paid has taken no cash off the van, so
  // it does not come off what the driver owes back. The column only appears
  // when there is something outstanding — normally everything is paid at once.
  const hasUnpaidSpend = Object.values(trip?.trip_expenses_unpaid || {}).some(
    (amount) => Number(amount) > 0
  );

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

  // keep the name box in step with the loaded trip (and with a save that just
  // landed), without disturbing whatever the user is mid-way through typing
  useEffect(() => {
    setEditedName(trip?.name || "");
  }, [trip?.uuid, trip?.name]);

  const saveNameMutation = useMutation({
    mutationFn: async (name: string | null) =>
      await apiRequest(`/trip/${params?.uuid}`, { method: "PUT", body: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      toast({ title: t("common.success"), description: t("trips.updatedSuccess") });
    },
    onError: (error: any) =>
      toast({
        title: t("common.error"),
        description: error?.message || t("trips.failedUpdate"),
        variant: "destructive",
      }),
  });

  const updateTripMutation = useMutation({
    mutationFn: async (data: { notes?: string; name?: string | null }) => {
      return await apiRequest(`/trip/${params?.uuid}`, {
        method: "PUT",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      setIsEditing(false);
      toast({
        title: t("common.success"),
        description: t("trips.updatedSuccess"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("trips.failedUpdate"),
        variant: "destructive",
      });
    },
  });

  // Both audit writes are POSTs: un-audit is /unaudit rather than DELETE /audit
  // because the ACL gate keys on (blueprint, method), and a DELETE would demand
  // `trip: delete`, which an operation manager does not hold.
  const invalidateAfterAudit = () => {
    // ["/trip/"] already prefix-matches this page's detail key, but name both so
    // the dependency is obvious if either key is ever changed.
    queryClient.invalidateQueries({ queryKey: ["/trip/"] });
    queryClient.invalidateQueries({ queryKey: ["/trip/", params?.uuid] });
  };

  const auditTripMutation = useMutation({
    mutationFn: () => apiRequest(`/trip/${params?.uuid}/audit`, { method: "POST", body: {} }),
    onSuccess: () => {
      invalidateAfterAudit();
      toast({ title: t("common.success"), description: t("trips.auditMarked") });
    },
    onError: (error: unknown) => {
      toast({
        title: t("common.error"),
        description: apiErrorMessage(error, t("trips.failedAudit")),
        variant: "destructive",
      });
    },
  });

  const unauditTripMutation = useMutation({
    mutationFn: () => apiRequest(`/trip/${params?.uuid}/unaudit`, { method: "POST", body: {} }),
    onSuccess: () => {
      invalidateAfterAudit();
      toast({ title: t("common.success"), description: t("trips.auditCleared") });
    },
    onError: (error: unknown) => {
      toast({
        title: t("common.error"),
        description: apiErrorMessage(error, t("trips.failedUnaudit")),
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    setEditedNotes(trip?.notes || "");
    setEditedName(trip?.name || "");
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
    // `label` stays the raw identifier used for the copiedField comparison;
    // translate it only for the toast message.
    const labelText = label === 'Vehicle UUID' ? t('trips.vehicleUuid') : t('trips.tripUuid');
    toast({
      title: t("trips.copied"),
      description: t("trips.copiedToClipboard", { label: labelText }),
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return t('trips.notSet');
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
            {t('trips.backToTrips')}
          </Button>
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-600">{t('trips.errorLoadingTrip', { message: error?.message || t('trips.tripNotFound') })}</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // "Audited by admin on Jul 28, 2026". Falls back to the date alone when the
  // auditor's uuid resolves to no username (a uuid from another tenant comes back
  // unresolved rather than leaking a name).
  const auditedDate = trip.audited_at ? format(parseNaiveUtc(trip.audited_at), 'MMM d, yyyy') : null;
  const auditSummary = !trip.is_audited
    ? t('trips.awaitingReview')
    : auditedDate
      ? trip.audited_by_username
        ? t('trips.auditedByOn', { user: trip.audited_by_username, date: auditedDate })
        : t('trips.auditedOn', { date: auditedDate })
      : t('trips.audited');

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
          {t('trips.backToTrips')}
        </Button>

        {/* Trip Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Truck className="h-8 w-8 text-gray-600" />
                <h1 className="text-3xl font-medium text-gray-900">{t('trips.detailsTitle')}</h1>
              </div>
              <p className="text-gray-500" data-testid="text-header-trip-uuid">{t('trips.headerUuid', { uuid: trip.uuid })}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <Badge className={getStatusBadgeClass(trip.status)} data-testid="badge-status">
                  {te(trip.status)}
                </Badge>
                <Badge
                  className={trip.is_audited ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
                  data-testid="badge-audit"
                >
                  {trip.is_audited ? (
                    <ClipboardCheck className="h-3.5 w-3.5 me-1" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 me-1" />
                  )}
                  {trip.is_audited ? t('trips.audited') : t('trips.notAudited')}
                </Badge>
                {/* hidden for roles the backend would refuse, so nobody is offered
                    a button that can only 403 */}
                {canAudit && (trip.is_audited ? (
                  <Button
                    variant="outline"
                    onClick={() => unauditTripMutation.mutate()}
                    disabled={unauditTripMutation.isPending}
                    data-testid="button-unaudit-trip"
                  >
                    <Undo2 className="h-4 w-4 me-2" />
                    {t('trips.undoAudit')}
                  </Button>
                ) : (
                  <Button
                    className="bg-[#5469D4] hover:bg-[#4356C7] text-white"
                    onClick={() => auditTripMutation.mutate()}
                    disabled={auditTripMutation.isPending}
                    data-testid="button-audit-trip"
                  >
                    <ClipboardCheck className="h-4 w-4 me-2" />
                    {t('trips.markAudited')}
                  </Button>
                ))}
                {isAdmin && (
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="button-delete-trip"
                  >
                    <Trash2 className="h-4 w-4 me-2" />
                    {t('trips.deleteTrip')}
                  </Button>
                )}
              </div>
              <p
                className="text-sm text-gray-500"
                data-testid="text-audit-detail"
                title={trip.audited_at ? format(parseNaiveUtc(trip.audited_at), 'PPpp') : undefined}
              >
                {auditSummary}
              </p>
            </div>
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('trips.deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('trips.deleteConfirmDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-trip">{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteTripMutation.isPending}
                onClick={() => deleteTripMutation.mutate()}
                data-testid="button-confirm-delete-trip"
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="grid gap-6 md:grid-cols-2">
          {/* General Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('trips.generalInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* the run's name: what a person identifies a trip by, so it comes
                  before the uuid. Editable in place — PUT /trip/<uuid> already
                  accepts it. Blank clears it back to unnamed. */}
              <div>
                <label className="text-sm font-medium text-gray-500">{t('trips.colName')}</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    maxLength={120}
                    placeholder={t('trips.namePlaceholder')}
                    className="h-9"
                    data-testid="input-trip-name"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saveNameMutation.isPending || editedName === (trip.name || "")}
                    onClick={() => {
                      // its own request, not updateTripMutation: that one's
                      // onSuccess calls setIsEditing(false), which would slam the
                      // notes editor shut (and lose an unsaved note) just because
                      // the name was saved
                      saveNameMutation.mutate(editedName.trim() || null);
                    }}
                    data-testid="button-save-trip-name"
                  >
                    {saveNameMutation.isPending ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">{t('trips.tripUuid')}</label>
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
                <label className="text-sm font-medium text-gray-500">{t('trips.vehicleUuid')}</label>
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
                  <label className="text-sm font-medium text-gray-500">{t('trips.serviceAreaUuid')}</label>
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-service-area-uuid">{trip.service_area_uuid}</p>
                </div>
              )}

              {trip.workflow_execution_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">{t('trips.workflowExecution')}</label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-workflow-execution-uuid">{trip.workflow_execution_uuid}</p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setLocation(`/workflow-execution/${trip.workflow_execution_uuid}`)}
                      className="p-0 h-auto"
                      data-testid="button-view-workflow"
                    >
                      {t('common.view')}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-500">{t('common.createdAt')}</label>
                <p className="text-sm text-gray-900" data-testid="text-created-at">{formatDateTime(trip.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Timing Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('trips.timingWarehouses')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">{t('trips.startTime')}</label>
                <p className="text-sm text-gray-900" data-testid="text-start-time">{formatDateTime(trip.start_time)}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">{t('trips.endTime')}</label>
                <p className="text-sm text-gray-900" data-testid="text-end-time">{formatDateTime(trip.end_time)}</p>
              </div>

              {trip.start_warehouse_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">{t('trips.startWarehouse')}</label>
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-start-warehouse-uuid">{trip.start_warehouse_uuid}</p>
                </div>
              )}

              {trip.end_warehouse_uuid && (
                <div>
                  <label className="text-sm font-medium text-gray-500">{t('trips.endWarehouse')}</label>
                  <p className="text-sm font-mono text-gray-900 break-all" data-testid="text-end-warehouse-uuid">{trip.end_warehouse_uuid}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cash reconciliation: collected at the stops, less what was actually
            paid out on the road, giving what should come back. Costs booked but
            still unpaid are shown apart — they are owed to whoever fronted
            them, not missing from the van */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-gray-600" />
              <CardTitle>{t('trips.expectedCash')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {cashCurrencies.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trip-cash">
                  <thead>
                    <tr className="text-start text-gray-500 border-b">
                      <th className="py-2 pe-4 font-medium">{t('common.currency')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('trips.cashCollected')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('trips.tripSpend')}</th>
                      {hasUnpaidSpend && (
                        <th className="py-2 pe-4 font-medium text-end">{t('trips.unpaidSpend')}</th>
                      )}
                      <th className="py-2 font-medium text-end">{t('trips.shouldReturn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashCurrencies.map((cur) => {
                      const collected = Number((trip.expected_cash || {})[cur] || 0);
                      const paid = Number((trip.trip_expenses_paid || {})[cur] || 0);
                      const unpaid = Number((trip.trip_expenses_unpaid || {})[cur] || 0);
                      const net = Number(
                        (trip.net_expected_cash || {})[cur] ?? collected - paid
                      );
                      return (
                        <tr key={cur} className="border-b last:border-0" data-testid={`trip-cash-${cur}`}>
                          <td className="py-2 pe-4">{te(cur)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums">{collected.toFixed(2)}</td>
                          <td className="py-2 pe-4 text-end tabular-nums text-amber-700">
                            {paid ? `- ${paid.toFixed(2)}` : "—"}
                          </td>
                          {hasUnpaidSpend && (
                            <td
                              className="py-2 pe-4 text-end tabular-nums text-gray-500"
                              data-testid={`trip-cash-unpaid-${cur}`}
                            >
                              {unpaid ? unpaid.toFixed(2) : "—"}
                            </td>
                          )}
                          <td
                            className={`py-2 text-end font-semibold tabular-nums ${
                              net < 0 ? "text-red-600" : ""
                            }`}
                          >
                            {net.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500" data-testid="expected-cash-empty">{t('trips.noCashCollected')}</p>
            )}
          </CardContent>
        </Card>

        {/* Costs booked to this trip */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-gray-600" />
              <CardTitle>{t('trips.tripExpenses')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {tripExpenses.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="trip-expenses-empty">
                {t('trips.noTripExpenses')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trip-expenses">
                  <thead>
                    <tr className="text-start text-gray-500 border-b">
                      <th className="py-2 pe-4 font-medium">{t('common.date')}</th>
                      <th className="py-2 pe-4 font-medium">{t('expenses.categoriesFilter')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('common.amount')}</th>
                      <th className="py-2 pe-4 font-medium">{t('customers.payment')}</th>
                      <th className="py-2 font-medium">{t('common.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripExpenses.map((e: any) => (
                      <tr key={e.uuid} className="border-b last:border-0" data-testid={`trip-expense-row-${e.uuid}`}>
                        <td className="py-2 pe-4 whitespace-nowrap">{e.created_at ? format(new Date(e.created_at), 'PP') : '—'}</td>
                        <td className="py-2 pe-4">{te(e.category)}</td>
                        <td className="py-2 pe-4 text-end tabular-nums">
                          {Number(e.amount).toFixed(2)}{" "}
                          <span className="text-xs text-gray-500">{te(e.currency)}</span>
                        </td>
                        <td className="py-2 pe-4">
                          <Badge
                            variant="secondary"
                            className={e.is_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}
                          >
                            {e.is_paid ? te('paid') : te('unpaid')}
                          </Badge>
                        </td>
                        <td className="py-2 max-w-xs truncate text-gray-600">{e.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Start/end inventory + reconciliation */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('trips.inventory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {trip.inventory_reconciliation && Object.keys(trip.inventory_reconciliation).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trip-inventory">
                  <thead>
                    <tr className="text-start text-gray-500 border-b">
                      <th className="py-2 pe-4 font-medium">{t('trips.material')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('trips.reconStart')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('trips.reconSold')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('trips.reconExpectedEnd')}</th>
                      <th className="py-2 pe-4 font-medium text-end">{t('trips.reconEnd')}</th>
                      <th className="py-2 font-medium text-end">{t('trips.reconVariance')}</th>
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
                    {t('trips.endInventoryNote')}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-gray-500" data-testid="trip-inventory-empty">{t('trips.noInventorySnapshot')}</p>
            )}
          </CardContent>
        </Card>

        {/* Vehicle inventory over the trip window */}
        <div className="mt-6">
          <VehicleInventoryChart
            vehicleUuid={trip.vehicle_uuid}
            windowStart={trip.start_time || trip.created_at}
            windowEnd={trip.end_time}
            title={t('trips.vehicleInventoryDuringTrip')}
          />
        </div>

        {/* Trip stop customers: sorted table / animated map */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('trips.stopsTitle')}</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant={stopsView === "table" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStopsView("table")}
                  data-testid="button-stops-table"
                >
                  <TableIcon className="h-4 w-4 me-2" /> {t('trips.tableView')}
                </Button>
                <Button
                  variant={stopsView === "map" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStopsView("map")}
                  data-testid="button-stops-map"
                >
                  <MapIcon className="h-4 w-4 me-2" /> {t('trips.mapView')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stops.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="trip-stops-empty">{t('trips.noStopsYet')}</p>
            ) : stopsView === "map" ? (
              <TripStopsMap stops={stops} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trip-stops">
                  <thead>
                    <tr className="text-start text-gray-500 border-b">
                      <th className="py-2 pe-4 font-medium">#</th>
                      <th className="py-2 pe-4 font-medium">{t('trips.customer')}</th>
                      <th className="py-2 pe-4 font-medium">{t('common.status')}</th>
                      <th className="py-2 pe-4 font-medium">{t('trips.outcome')}</th>
                      <th className="py-2 pe-4 font-medium">{t('customers.comments')}</th>
                      <th className="py-2 font-medium">{t('trips.colCompleted')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stopsPageRows.map((s: any, i: number) => (
                      <tr key={s.uuid} className="border-b last:border-0">
                        <td className="py-2 pe-4 text-gray-500">{stopsPage * PAGE_SIZE + i + 1}</td>
                        <td className="py-2 pe-4">{s.customer_name || "—"}</td>
                        <td className="py-2 pe-4">
                          <Badge variant={s.status === "completed" ? "secondary" : "outline"}>
                            {s.status ? te(s.status) : "—"}
                          </Badge>
                        </td>
                        <td className="py-2 pe-4 max-w-[240px] truncate">{s.outcome ? te(s.outcome) : "—"}</td>
                        <td
                          className="py-2 pe-4 max-w-[260px] truncate text-gray-600"
                          title={s.notes || undefined}
                        >
                          {s.notes || "—"}
                        </td>
                        <td className="py-2 whitespace-nowrap">{s.completed_at ? formatDateTime(s.completed_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stops.length > PAGE_SIZE && (
                  <div className="flex items-center justify-end gap-3 mt-3">
                    <span className="text-xs text-gray-500" data-testid="trip-stops-page-info">
                      {t('trips.pageRange', {
                        from: stopsPage * PAGE_SIZE + 1,
                        to: Math.min((stopsPage + 1) * PAGE_SIZE, stops.length),
                        total: stops.length,
                      })}
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
              <CardTitle>{t('nav.locationTracking')}</CardTitle>
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
            <CardTitle>{t('trips.activityTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activityTab}
              onValueChange={(v) => { setActivityTab(v); setActivityPage(0); }}
            >
              <TabsList data-testid="tabs-trip-activity">
                <TabsTrigger value="orders" data-testid="tab-orders">
                  {t('trips.tabOrders', { count: activity?.orders?.length ?? 0 })}
                </TabsTrigger>
                <TabsTrigger value="fulfillments" data-testid="tab-fulfillments">
                  {t('trips.tabFulfilled', { count: activity?.fulfillments?.length ?? 0 })}
                </TabsTrigger>
                <TabsTrigger value="payments" data-testid="tab-payments">
                  {t('trips.tabPaid', { count: activity?.payments?.length ?? 0 })}
                </TabsTrigger>
                <TabsTrigger value="analytics" data-testid="tab-analytics">
                  {t('trips.tabAnalytics')}
                </TabsTrigger>
              </TabsList>

              <div className="mt-4">
                {activityTab === "analytics" ? (
                  <TripAnalytics activity={activity} />
                ) : pageRows.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center" data-testid="trip-activity-empty">
                    {t('trips.nothingHere')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-trip-activity">
                      <thead>
                        <tr className="text-start text-gray-500 border-b">
                          <th className="py-2 pe-4 font-medium">{t('common.date')}</th>
                          <th className="py-2 pe-4 font-medium">{t('trips.customer')}</th>
                          {activityTab === "orders" && (
                            <>
                              <th className="py-2 pe-4 font-medium text-end">{t('common.total')}</th>
                              <th className="py-2 font-medium">{t('common.status')}</th>
                            </>
                          )}
                          {activityTab === "fulfillments" && (
                            <>
                              <th className="py-2 pe-4 font-medium">{t('trips.material')}</th>
                              <th className="py-2 font-medium text-end">{t('trips.qty')}</th>
                            </>
                          )}
                          {activityTab === "payments" && (
                            <th className="py-2 font-medium text-end">{t('common.amount')}</th>
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
                                <td className="py-2 pe-4 text-end">{r.total} {te(r.currency)}</td>
                                <td className="py-2">
                                  <div className="flex gap-2">
                                    <Badge variant={r.is_paid ? "secondary" : "destructive"}>
                                      {r.is_paid ? te("paid") : te("unpaid")}
                                    </Badge>
                                    <Badge variant={r.is_fulfilled ? "secondary" : "outline"}>
                                      {r.is_fulfilled ? te("fulfilled") : t("trips.unfulfilled")}
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
                              <td className="py-2 text-end">{r.amount} {te(r.currency)}</td>
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
                      {t('trips.pageRange', {
                        from: activityPage * PAGE_SIZE + 1,
                        to: Math.min((activityPage + 1) * PAGE_SIZE, activityRows.length),
                        total: activityRows.length,
                      })}
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
              <CardTitle>{t('common.notes')}</CardTitle>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditClick}
                  data-testid="button-edit-notes"
                >
                  <Edit3 className="h-4 w-4 me-2" />
                  {t('common.edit')}
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
                  placeholder={t('trips.notesPlaceholder')}
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
                    {updateTripMutation.isPending ? t('common.saving') : t('common.save')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelClick}
                    disabled={updateTripMutation.isPending}
                    data-testid="button-cancel-edit"
                  >
                    <X className="h-4 w-4 me-2" />
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-900 whitespace-pre-wrap" data-testid="text-notes">
                {trip.notes || t('trips.noNotes')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Trip Data Section */}
        {trip.data && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t('trips.tripData')}</CardTitle>
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
