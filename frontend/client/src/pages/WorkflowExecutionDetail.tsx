import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  ArrowLeft,
  Filter,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";
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
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Workflow } from "@shared/schema";
import type {
  WorkflowExecutionPage,
  WorkflowExecutionStatus,
  WorkflowExecutionCreate,
} from "@/types/workflowExecution";
import { WorkflowExecutionStatusLabels } from "@/types/workflowExecution";

export default function WorkflowExecutionDetail() {
  const [, params] = useRoute("/workflow-execution/:uuid");
  const workflowUuid = params?.uuid || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [filters, setFilters] = useState({
    uuid: "",
    name: "",
    status: undefined as WorkflowExecutionStatus | undefined,
    created_by_uuid: "",
    start_time: "",
    end_time: "",
    tags: "",
    per_page: 20,
  });
  const [page, setPage] = useState(1);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [tempFilters, setTempFilters] = useState(filters);
  const [deleteTargetUuid, setDeleteTargetUuid] = useState<string | null>(null);
  const { isAdmin } = useAuth();

  const deleteExecutionMutation = useMutation({
    mutationFn: (uuid: string) => apiRequest(`/workflow-execution/${uuid}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/"] });
      // any trip the execution created is soft-deleted too
      queryClient.invalidateQueries({ queryKey: ["/trip/"] });
      toast({ title: "Execution deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete execution",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => setDeleteTargetUuid(null),
  });

  // Fetch workflow details
  const { data: workflow } = useQuery<Workflow>({
    queryKey: ["/workflow/", workflowUuid],
    queryFn: async () => {
      const response = await apiRequest(`/workflow/${workflowUuid}`);
      return response;
    },
    enabled: !!workflowUuid,
  });

  // Build query params for executions
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.append("workflow_uuid", workflowUuid);
    if (filters.uuid) params.append("uuid", filters.uuid);
    if (filters.name) params.append("name", filters.name);
    if (filters.status) params.append("status", filters.status);
    if (filters.created_by_uuid) params.append("created_by_uuid", filters.created_by_uuid);
    if (filters.start_time) params.append("start_time", filters.start_time);
    if (filters.end_time) params.append("end_time", filters.end_time);
    if (filters.tags) params.append("tags", filters.tags);
    params.append("page", page.toString());
    params.append("per_page", filters.per_page.toString());
    return params.toString();
  };

  // Fetch workflow executions
  const { data: executionsPage, isLoading } = useQuery<WorkflowExecutionPage>({
    queryKey: ["/workflow-execution/", workflowUuid, filters, page],
    queryFn: async () => {
      const queryParams = buildQueryParams();
      const url = `/workflow-execution/${queryParams ? "?" + queryParams : ""}`;
      return await apiRequest(url);
    },
    enabled: !!workflowUuid,
  });

  // Create execution mutation
  const createExecutionMutation = useMutation({
    mutationFn: async (payload: WorkflowExecutionCreate) => {
      return await apiRequest("/workflow-execution/", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/"] });
      setShowExecuteDialog(false);
      toast({
        title: "Execution started",
        description: "Workflow execution has been initiated successfully.",
      });
      // route straight to the new execution's detail page
      if (created?.uuid) {
        setLocation(`/workflow-execution/${workflowUuid}/${created.uuid}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start workflow execution",
        variant: "destructive",
      });
    },
  });

  const handleOpenFiltersModal = () => {
    setTempFilters(filters);
    setShowFiltersModal(true);
  };

  const handleApplyFilters = () => {
    setFilters(tempFilters);
    setPage(1);
    setShowFiltersModal(false);
  };

  const clearFilters = () => {
    const clearedFilters = {
      uuid: "",
      name: "",
      status: undefined,
      created_by_uuid: "",
      start_time: "",
      end_time: "",
      tags: "",
      per_page: 20,
    };
    setFilters(clearedFilters);
    setTempFilters(clearedFilters);
    setPage(1);
    setShowFiltersModal(false);
  };

  const handleExecuteWorkflow = () => {
    if (workflowUuid) {
      createExecutionMutation.mutate({
        workflow_uuid: workflowUuid,
        parameters: {},
      });
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (start: string | null | undefined, end: string | null | undefined) => {
    if (!start) return "N/A";
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);
    
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getStatusIcon = (status: WorkflowExecutionStatus) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "not_started":
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadgeVariant = (status: WorkflowExecutionStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status.toLowerCase()) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "in_progress":
        return "secondary";
      default:
        return "outline";
    }
  };

  const executions = executionsPage?.workflow_executions || [];
  const totalPages = executionsPage?.pages || 1;
  const currentPage = executionsPage?.page || 1;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const activeFiltersCount = [
    filters.uuid,
    filters.name,
    filters.status,
    filters.created_by_uuid,
    filters.start_time,
    filters.end_time,
    filters.tags,
  ].filter(Boolean).length;

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="container mx-auto space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/workflow-execution">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Workflow Executions
                </h1>
                {workflow && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {workflow.name}
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={() => setShowExecuteDialog(true)}
              data-testid="button-execute-workflow"
            >
              <Play className="h-4 w-4 mr-2" />
              Execute Workflow
            </Button>
          </div>

          {/* Main Content */}
          <Card>
            {/* Filters and Actions */}
            <div className="p-4 border-b flex justify-between items-center">
              <Button
                variant="outline"
                onClick={handleOpenFiltersModal}
                data-testid="button-open-filters"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : executions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No workflow executions found</p>
                <Button
                  onClick={() => setShowExecuteDialog(true)}
                  className="mt-4"
                  data-testid="button-execute-first"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Execute Workflow
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ended</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Tags</TableHead>
                      {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executions.map((execution) => (
                      <TableRow
                        key={execution.uuid}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        data-testid={`row-execution-${execution.uuid}`}
                      >
                        <TableCell>
                          <Link href={`/workflow-execution/${workflowUuid}/${execution.uuid}`}>
                            <span className="text-blue-600 hover:underline font-medium">
                              {execution.name || execution.uuid}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(execution.status)}
                            <Badge variant={getStatusBadgeVariant(execution.status)}>
                              {WorkflowExecutionStatusLabels[execution.status]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(execution.start_time)}</TableCell>
                        <TableCell>{formatDate(execution.end_time)}</TableCell>
                        <TableCell>{formatDuration(execution.start_time, execution.end_time)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {execution.tags && execution.tags.length > 0 ? (
                              execution.tags.map((tag, idx) => (
                                <Badge key={idx} variant="outline">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-400 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetUuid(execution.uuid);
                              }}
                              data-testid={`button-delete-execution-${execution.uuid}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <AlertDialog
                  open={!!deleteTargetUuid}
                  onOpenChange={(open) => !open && setDeleteTargetUuid(null)}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this execution?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The execution and any trip it created will be removed from all
                        lists. This cannot be undone from the app.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete-execution">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        disabled={deleteExecutionMutation.isPending}
                        onClick={() => deleteTargetUuid && deleteExecutionMutation.mutate(deleteTargetUuid)}
                        data-testid="button-confirm-delete-execution"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t p-4">
                    <div className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid="button-previous-page"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Filters Modal */}
          <Dialog open={showFiltersModal} onOpenChange={setShowFiltersModal}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Filter Workflow Executions</DialogTitle>
                <DialogDescription>
                  Apply filters to narrow down the executions list
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">UUID</label>
                  <Input
                    placeholder="Filter by UUID"
                    value={tempFilters.uuid}
                    onChange={(e) => setTempFilters({ ...tempFilters, uuid: e.target.value })}
                    data-testid="input-filter-uuid"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="Filter by name"
                    value={tempFilters.name}
                    onChange={(e) => setTempFilters({ ...tempFilters, name: e.target.value })}
                    data-testid="input-filter-name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={tempFilters.status || ""}
                    onValueChange={(value) =>
                      setTempFilters({
                        ...tempFilters,
                        status: value ? (value as WorkflowExecutionStatus) : undefined,
                      })
                    }
                  >
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All statuses</SelectItem>
                      <SelectItem value="not_started">Not Started</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Created By UUID</label>
                  <Input
                    placeholder="Filter by creator UUID"
                    value={tempFilters.created_by_uuid}
                    onChange={(e) =>
                      setTempFilters({ ...tempFilters, created_by_uuid: e.target.value })
                    }
                    data-testid="input-filter-created-by"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Time (From)</label>
                  <Input
                    type="datetime-local"
                    value={tempFilters.start_time}
                    onChange={(e) =>
                      setTempFilters({ ...tempFilters, start_time: e.target.value })
                    }
                    data-testid="input-filter-start-time"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">End Time (To)</label>
                  <Input
                    type="datetime-local"
                    value={tempFilters.end_time}
                    onChange={(e) => setTempFilters({ ...tempFilters, end_time: e.target.value })}
                    data-testid="input-filter-end-time"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-sm font-medium">Tags</label>
                  <Input
                    placeholder="Filter by tags (comma-separated)"
                    value={tempFilters.tags}
                    onChange={(e) => setTempFilters({ ...tempFilters, tags: e.target.value })}
                    data-testid="input-filter-tags"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
                <Button onClick={handleApplyFilters} data-testid="button-apply-filters">
                  Apply Filters
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Execute Workflow Dialog */}
          <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Execute Workflow</DialogTitle>
                <DialogDescription>
                  Start a new execution of "{workflow?.name}"
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowExecuteDialog(false)}
                  data-testid="button-cancel-execute"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteWorkflow}
                  disabled={createExecutionMutation.isPending}
                  data-testid="button-confirm-execute"
                >
                  {createExecutionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Execute
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AppLayout>
  );
}
