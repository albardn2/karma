import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { ArrowLeft, Trash2, Save, X, Plus, Edit2, List, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";
import { API_BASE_URL } from "@/lib/config";
import type { Workflow, Task } from "@shared/schema";
import { TaskInputFieldBuilder } from "@/components/TaskInputFieldBuilder";
import type { TaskInputField } from "@/types/taskInputs";
import { TaskDAG } from "@/components/TaskDAG";

interface WorkflowFormData {
  name: string;
  description: string | null;
  tags: string[];
  parameters: string | null;
  callbackFns: string[];
}

interface TaskFormData {
  name: string;
  description: string | null;
  operator: string;
  taskInputs: TaskInputField[];
  dependsOn: string[];
  callbackFns: string[];
}

interface TaskPage {
  tasks: Task[];
  total_count: number;
}

export default function WorkflowDetail() {
  const [, params] = useRoute("/workflows/:uuid");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const uuid = params?.uuid;

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<WorkflowFormData>({
    name: "",
    description: null,
    tags: [],
    parameters: "",
    callbackFns: [],
  });

  const [tagsInput, setTagsInput] = useState("");
  const [callbacksInput, setCallbacksInput] = useState("");

  // Task management state
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskFormData, setTaskFormData] = useState<TaskFormData>({
    name: "",
    description: null,
    operator: "",
    taskInputs: [],
    dependsOn: [],
    callbackFns: [],
  });
  const [taskCallbacksInput, setTaskCallbacksInput] = useState("");
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [taskViewMode, setTaskViewMode] = useState<"list" | "dag">("dag"); // Default to DAG view

  // Fetch workflow data
  const { data: workflow, isLoading } = useQuery<Workflow>({
    queryKey: [`/workflow/${uuid}`],
    enabled: !!uuid,
  });

  // Fetch tasks for this workflow
  const { data: tasksData, isLoading: tasksLoading } = useQuery<TaskPage>({
    queryKey: ["/task/", uuid],
    queryFn: async () => {
      const response = await apiRequest(`/task/?workflow_uuid=${uuid}`);
      // Transform snake_case API response to camelCase for frontend
      if (response?.tasks) {
        response.tasks = response.tasks.map((task: any) => ({
          ...task,
          dependsOn: task.depends_on || task.dependsOn || null,
          callbackFns: task.callback_fns || task.callbackFns || null,
          taskInputs: task.task_inputs || task.taskInputs || null,
        }));
      }
      return response;
    },
    enabled: !!uuid,
  });

  const tasks = tasksData?.tasks || [];

  // Debug logging for tasks
  useEffect(() => {
    if (tasks.length > 0) {
      console.log("=== TASKS DATA ===");
      console.log("Tasks:", tasks);
      tasks.forEach(task => {
        console.log(`Task ${task.name}:`, {
          dependsOn: task.dependsOn,
          callbackFns: task.callbackFns,
        });
      });
    }
  }, [tasks]);

  // Fetch workflow operators from external API
  const { data: operators, isLoading: operatorsLoading, error: operatorsError } = useQuery<string[]>({
    queryKey: ["/task-execution/workflow-operators"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnMount: true,
  });

  // Debug logging
  useEffect(() => {
    if (!operatorsLoading) {
      console.log("=== OPERATORS FROM API ===");
      console.log("Operators:", operators);
      console.log("Count:", operators?.length);
      console.log("Error:", operatorsError);
    }
  }, [operators, operatorsLoading, operatorsError]);

  // Update form data when workflow data is loaded
  useEffect(() => {
    if (workflow) {
      // Handle parameters - convert to string if it's an object
      let parametersStr = "";
      if (workflow.parameters) {
        parametersStr = typeof workflow.parameters === 'string' 
          ? workflow.parameters 
          : JSON.stringify(workflow.parameters, null, 2);
      }
      
      setFormData({
        name: workflow.name || "",
        description: workflow.description || null,
        tags: workflow.tags || [],
        parameters: parametersStr,
        callbackFns: workflow.callbackFns || [],
      });
      setTagsInput((workflow.tags || []).join(", "));
      setCallbacksInput((workflow.callbackFns || []).join(", "));
    }
  }, [workflow]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<WorkflowFormData>) => {
      return await apiRequest(`/workflow/${uuid}`, {
        method: "PUT",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/workflow");
        },
      });

      toast({
        title: t('common.success'),
        description: t('workflows.updatedSuccess'),
      });

      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('workflows.updateFailed'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/workflow/${uuid}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/workflow");
        },
      });

      toast({
        title: t('common.success'),
        description: t('workflows.deletedSuccess'),
      });

      setLocation("/workflows");
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('workflows.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Parse parameters as JSON if provided
    let parsedParameters = null;
    if (formData.parameters?.trim()) {
      try {
        parsedParameters = JSON.parse(formData.parameters.trim());
      } catch (e) {
        toast({
          title: t('workflows.validationError'),
          description: t('workflows.invalidJsonParameters'),
          variant: "destructive",
        });
        return;
      }
    }

    const cleanedData: any = {
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      tags: tagsInput
        ? tagsInput.split(",").map((t) => t.trim()).filter((t) => t)
        : null,
      parameters: parsedParameters,
      callback_fns: callbacksInput
        ? callbacksInput.split(",").map((c) => c.trim()).filter((c) => c)
        : null,
    };

    updateMutation.mutate(cleanedData);
  };

  const handleCancel = () => {
    if (workflow) {
      // Handle parameters - convert to string if it's an object
      let parametersStr = "";
      if (workflow.parameters) {
        parametersStr = typeof workflow.parameters === 'string' 
          ? workflow.parameters 
          : JSON.stringify(workflow.parameters, null, 2);
      }
      
      setFormData({
        name: workflow.name || "",
        description: workflow.description || null,
        tags: workflow.tags || [],
        parameters: parametersStr,
        callbackFns: workflow.callbackFns || [],
      });
      setTagsInput((workflow.tags || []).join(", "));
      setCallbacksInput((workflow.callbackFns || []).join(", "));
    }
    setIsEditing(false);
  };

  // Task mutations
  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      return await apiRequest("/task/", {
        method: "POST",
        body: {
          name: data.name,
          description: data.description,
          operator: data.operator,
          workflow_uuid: uuid,
          depends_on: data.dependsOn,
          callback_fns: data.callbackFns,
          task_inputs: data.taskInputs.length > 0 ? {
            fields: data.taskInputs,
            data: null
          } : null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/task/", uuid] });
      toast({
        title: t('common.success'),
        description: t('workflows.taskCreatedSuccess'),
      });
      setIsTaskDialogOpen(false);
      resetTaskForm();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('workflows.taskCreateFailed'),
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (data: { uuid: string; updates: Partial<TaskFormData> }) => {
      const payload: any = {};
      
      if (data.updates.name !== undefined) payload.name = data.updates.name;
      if (data.updates.description !== undefined) payload.description = data.updates.description;
      if (data.updates.operator !== undefined) payload.operator = data.updates.operator;
      if (data.updates.dependsOn !== undefined) payload.depends_on = data.updates.dependsOn;
      if (data.updates.callbackFns !== undefined) payload.callback_fns = data.updates.callbackFns;
      if (data.updates.taskInputs !== undefined) {
        payload.task_inputs = data.updates.taskInputs && data.updates.taskInputs.length > 0 
          ? {
              fields: data.updates.taskInputs,
              data: null
            }
          : null;
      }
      
      return await apiRequest(`/task/${data.uuid}`, {
        method: "PUT",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/task/", uuid] });
      toast({
        title: t('common.success'),
        description: t('workflows.taskUpdatedSuccess'),
      });
      setIsTaskDialogOpen(false);
      resetTaskForm();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('workflows.taskUpdateFailed'),
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskUuid: string) => {
      return await apiRequest(`/task/${taskUuid}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/task/", uuid] });
      toast({
        title: t('common.success'),
        description: t('workflows.taskDeletedSuccess'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('workflows.taskDeleteFailed'),
        variant: "destructive",
      });
    },
  });

  const resetTaskForm = () => {
    setTaskFormData({
      name: "",
      description: null,
      operator: "",
      taskInputs: [],
      dependsOn: [],
      callbackFns: [],
    });
    setTaskCallbacksInput("");
    setSelectedDependencies([]);
    setEditingTask(null);
  };

  const handleOpenTaskDialog = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      
      // Parse task inputs from JSON to TaskInputField array
      let parsedInputs: TaskInputField[] = [];
      if (task.taskInputs) {
        try {
          const parsed = typeof task.taskInputs === 'string' 
            ? JSON.parse(task.taskInputs) 
            : task.taskInputs;
          
          // Handle new format: { fields: [...], data: {...} }
          if (parsed && typeof parsed === 'object' && 'fields' in parsed) {
            parsedInputs = Array.isArray(parsed.fields) ? parsed.fields : [];
          } else if (Array.isArray(parsed)) {
            // Handle old format: just an array
            parsedInputs = parsed;
          }
        } catch (e) {
          console.error("Failed to parse task inputs:", e);
        }
      }
      
      setTaskFormData({
        name: task.name,
        description: task.description,
        operator: task.operator,
        taskInputs: parsedInputs,
        dependsOn: task.dependsOn || [],
        callbackFns: task.callbackFns || [],
      });
      setTaskCallbacksInput((task.callbackFns || []).join(", "));
      setSelectedDependencies(task.dependsOn || []);
    } else {
      resetTaskForm();
    }
    setIsTaskDialogOpen(true);
  };

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanedData: TaskFormData = {
      name: taskFormData.name.trim(),
      description: taskFormData.description?.trim() || null,
      operator: taskFormData.operator,
      taskInputs: taskFormData.taskInputs,
      dependsOn: selectedDependencies,
      callbackFns: taskCallbacksInput
        ? taskCallbacksInput.split(",").map((c) => c.trim()).filter((c) => c)
        : [],
    };

    if (editingTask) {
      updateTaskMutation.mutate({ uuid: editingTask.uuid, updates: cleanedData });
    } else {
      createTaskMutation.mutate(cleanedData);
    }
  };

  const handleToggleDependency = (taskName: string) => {
    setSelectedDependencies(prev =>
      prev.includes(taskName)
        ? prev.filter(name => name !== taskName)
        : [...prev, taskName]
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="container mx-auto">
          <Card>
            <CardContent className="p-12 text-center text-gray-500">
              {t('workflows.loadingDetails')}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="container mx-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('workflows.notFound')}
              </h3>
              <Link href="/workflows">
                <Button variant="outline">{t('workflows.backToWorkflows')}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/workflows">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {workflow.name}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {t('workflows.workflowDetails')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit"
                >
                  {t('common.edit')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" data-testid="button-delete">
                      <Trash2 className="h-4 w-4 me-2" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('workflows.deleteWorkflow')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('workflows.deleteConfirm')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                        data-testid="button-confirm-delete"
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  data-testid="button-cancel"
                >
                  <X className="h-4 w-4 me-2" />
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={updateMutation.isPending}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 me-2" />
                  {updateMutation.isPending ? t('common.saving') : t('workflows.saveChanges')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Workflow Details */}
        <Card>
          <CardHeader>
            <CardTitle>{t('workflows.workflowInformation')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('common.name')} *</Label>
                  <Input
                    id="name"
                    data-testid="input-name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder={t('workflows.namePlaceholder')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('common.description')}</Label>
                  <Textarea
                    id="description"
                    data-testid="input-description"
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder={t('workflows.descriptionPlaceholder')}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">{t('workflows.tagsCommaSeparated')}</Label>
                  <Input
                    id="tags"
                    data-testid="input-tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder={t('workflows.tagsPlaceholder')}
                  />
                  <p className="text-sm text-gray-500">
                    {t('workflows.availableTags')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="parameters">{t('workflows.parametersJson')}</Label>
                  <Textarea
                    id="parameters"
                    data-testid="input-parameters"
                    value={formData.parameters || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, parameters: e.target.value })
                    }
                    placeholder='{"key": "value"}'
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="callbacks">
                    {t('workflows.callbackFunctionsCommaSeparated')}
                  </Label>
                  <Input
                    id="callbacks"
                    data-testid="input-callbacks"
                    value={callbacksInput}
                    onChange={(e) => setCallbacksInput(e.target.value)}
                    placeholder={t('workflows.callbacksPlaceholder')}
                  />
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div>
                  <Label className="text-gray-500">{t('common.name')}</Label>
                  <p className="mt-1 text-lg font-medium" data-testid="text-name">
                    {workflow.name}
                  </p>
                </div>

                <div>
                  <Label className="text-gray-500">{t('common.description')}</Label>
                  <p className="mt-1" data-testid="text-description">
                    {workflow.description || "-"}
                  </p>
                </div>

                <div>
                  <Label className="text-gray-500">{t('workflows.tags')}</Label>
                  <div className="mt-2 flex gap-2 flex-wrap" data-testid="text-tags">
                    {workflow.tags && workflow.tags.length > 0 ? (
                      workflow.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-gray-400">{t('workflows.noTags')}</span>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-gray-500">{t('workflows.parameters')}</Label>
                  <pre
                    className="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-md text-sm overflow-x-auto"
                    data-testid="text-parameters"
                  >
                    {workflow.parameters 
                      ? (typeof workflow.parameters === 'string' 
                          ? workflow.parameters 
                          : JSON.stringify(workflow.parameters, null, 2))
                      : "{}"}
                  </pre>
                </div>

                <div>
                  <Label className="text-gray-500">{t('workflows.callbackFunctions')}</Label>
                  <div className="mt-2" data-testid="text-callbacks">
                    {workflow.callbackFns && workflow.callbackFns.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1">
                        {workflow.callbackFns.map((fn, idx) => (
                          <li key={idx} className="text-sm">
                            {fn}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400">{t('workflows.noCallbackFunctions')}</span>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-gray-500">{t('common.createdAt')}</Label>
                      <p className="mt-1" data-testid="text-created-at">
                        {workflow.createdAt
                          ? new Date(workflow.createdAt).toLocaleString()
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-gray-500">{t('workflows.uuid')}</Label>
                      <p className="mt-1 font-mono text-xs" data-testid="text-uuid">
                        {workflow.uuid}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('workflows.tasks')}</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md">
                <Button
                  size="sm"
                  variant={taskViewMode === "list" ? "default" : "ghost"}
                  onClick={() => setTaskViewMode("list")}
                  className="rounded-e-none"
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4 me-1" />
                  {t('workflows.list')}
                </Button>
                <Button
                  size="sm"
                  variant={taskViewMode === "dag" ? "default" : "ghost"}
                  onClick={() => setTaskViewMode("dag")}
                  className="rounded-s-none"
                  data-testid="button-view-dag"
                >
                  <Network className="h-4 w-4 me-1" />
                  {t('workflows.dag')}
                </Button>
              </div>
              <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() => handleOpenTaskDialog()}
                    data-testid="button-create-task"
                  >
                    <Plus className="h-4 w-4 me-2" />
                    {t('workflows.createTask')}
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingTask ? t('workflows.editTask') : t('workflows.createTask')}
                  </DialogTitle>
                  <DialogDescription>
                    {editingTask
                      ? t('workflows.updateTaskDesc')
                      : t('workflows.addTaskDesc')}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleTaskSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="task-name">{t('common.name')} *</Label>
                    <Input
                      id="task-name"
                      value={taskFormData.name}
                      onChange={(e) =>
                        setTaskFormData({ ...taskFormData, name: e.target.value })
                      }
                      placeholder={t('workflows.taskNamePlaceholder')}
                      required
                      data-testid="input-task-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="task-description">{t('common.description')}</Label>
                    <Textarea
                      id="task-description"
                      value={taskFormData.description || ""}
                      onChange={(e) =>
                        setTaskFormData({
                          ...taskFormData,
                          description: e.target.value,
                        })
                      }
                      placeholder={t('workflows.taskDescriptionPlaceholder')}
                      rows={3}
                      data-testid="input-task-description"
                    />
                  </div>

                  <div>
                    <Label htmlFor="task-operator">{t('workflows.operator')} *</Label>
                    {operatorsLoading ? (
                      <div className="text-sm text-gray-500 py-2">{t('workflows.loadingOperators')}</div>
                    ) : operators && operators.length > 0 ? (
                      <Select
                        value={taskFormData.operator}
                        onValueChange={(value) =>
                          setTaskFormData({ ...taskFormData, operator: value })
                        }
                      >
                        <SelectTrigger id="task-operator" data-testid="select-operator">
                          <SelectValue placeholder={t('workflows.selectOperator')} />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-gray-500 py-2 px-3 border rounded-md bg-gray-50">
                        {t('workflows.noOperatorsAvailable', { url: `${API_BASE_URL}/task-execution/workflow-operators` })}
                      </div>
                    )}
                  </div>

                  <div>
                    <TaskInputFieldBuilder
                      fields={taskFormData.taskInputs}
                      onChange={(fields) =>
                        setTaskFormData({ ...taskFormData, taskInputs: fields })
                      }
                    />
                  </div>

                  <div>
                    <Label>{t('workflows.dependencies')}</Label>
                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                      {tasks.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          {t('workflows.noOtherTasks')}
                        </p>
                      ) : (
                        tasks
                          .filter(t => !editingTask || t.uuid !== editingTask.uuid)
                          .map((task) => (
                            <div key={task.uuid} className="flex items-center space-x-2 rtl:space-x-reverse">
                              <input
                                type="checkbox"
                                id={`dep-${task.uuid}`}
                                checked={selectedDependencies.includes(task.name)}
                                onChange={() => handleToggleDependency(task.name)}
                                className="rounded"
                                data-testid={`checkbox-dependency-${task.name}`}
                              />
                              <label
                                htmlFor={`dep-${task.uuid}`}
                                className="text-sm cursor-pointer"
                              >
                                {task.name}
                              </label>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="task-callbacks">
                      {t('workflows.callbackFunctions')}
                      <span className="text-gray-500 text-xs ms-2">
                        {t('workflows.commaSeparated')}
                      </span>
                    </Label>
                    <Input
                      id="task-callbacks"
                      value={taskCallbacksInput}
                      onChange={(e) => setTaskCallbacksInput(e.target.value)}
                      placeholder={t('workflows.callbacksExamplePlaceholder')}
                      data-testid="input-task-callbacks"
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsTaskDialogOpen(false);
                        resetTaskForm();
                      }}
                      data-testid="button-cancel-task"
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="submit"
                      disabled={createTaskMutation.isPending || updateTaskMutation.isPending}
                      data-testid="button-save-task"
                    >
                      {editingTask ? t('workflows.updateTask') : t('workflows.createTask')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <p className="text-center text-gray-500 py-8">{t('workflows.loadingTasks')}</p>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">{t('workflows.noTasksYet')}</p>
                <p className="text-sm text-gray-400">
                  {t('workflows.createFirstTask')}
                </p>
              </div>
            ) : taskViewMode === "dag" ? (
              <TaskDAG
                tasks={tasks}
                onEditTask={handleOpenTaskDialog}
                onDeleteTask={(uuid) => deleteTaskMutation.mutate(uuid)}
              />
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => (
                  <div
                    key={task.uuid}
                    className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    data-testid={`task-item-${task.name}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium" data-testid={`text-task-name-${task.name}`}>
                            {task.name}
                          </h4>
                          <Badge variant="outline">{task.operator}</Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {task.description}
                          </p>
                        )}
                        {task.dependsOn && task.dependsOn.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs text-gray-500">{t('workflows.dependsOn')} </span>
                            {task.dependsOn.map((dep, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="me-1 text-xs"
                              >
                                {dep}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {task.callbackFns && task.callbackFns.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs text-gray-500">{t('workflows.callbacks')} </span>
                            {task.callbackFns.map((cb, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="me-1 text-xs"
                              >
                                {cb}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {t('workflows.createdWithDate', { date: task.createdAt ? new Date(task.createdAt).toLocaleDateString() : t('workflows.na') })}
                        </p>
                      </div>
                      <div className="flex gap-2 ms-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenTaskDialog(task)}
                          data-testid={`button-edit-task-${task.name}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              data-testid={`button-delete-task-${task.name}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('workflows.deleteTask')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('workflows.deleteTaskConfirm', { name: task.name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTaskMutation.mutate(task.uuid)}
                                className="bg-red-600 hover:bg-red-700"
                                data-testid={`confirm-delete-task-${task.name}`}
                              >
                                {t('common.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
