import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Ban,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TaskExecutionProgress } from "@/components/TaskExecutionProgress";
import { TripOperatorMap } from "@/components/map/TripOperatorMap";
import { CustomerLocationMap } from "@/components/map/CustomerLocationMap";
import { CreateOrderDialog } from "@/components/customer-orders/CreateOrderDialog";
import { CustomerRecentOrders } from "@/components/customer-orders/CustomerRecentOrders";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkflowExecution } from "@/types/workflowExecution";
import type { TaskExecution, TaskExecutionPage, TaskExecutionComplete } from "@/types/taskExecution";
import type { Task } from "@shared/schema";
import type { TaskInputField, FieldType } from "@/types/taskInputs";

export default function WorkflowExecutionTaskDetail() {
  const [, params] = useRoute("/workflow-execution/:workflow_uuid/:execution_uuid");
  const workflowUuid = params?.workflow_uuid || "";
  const executionUuid = params?.execution_uuid || "";
  const { toast } = useToast();
  const [selectedTaskExecutionUuid, setSelectedTaskExecutionUuid] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Fetch workflow execution details (includes task_executions)
  const { data: workflowExecution, isLoading: executionLoading } = useQuery<WorkflowExecution>({
    queryKey: ["/workflow-execution/", executionUuid],
    queryFn: async () => {
      return await apiRequest(`/workflow-execution/${executionUuid}`);
    },
    enabled: !!executionUuid,
  });

  const taskExecutions = workflowExecution?.task_executions || [];

  // Auto-select IN_PROGRESS task or first task
  useEffect(() => {
    if (taskExecutions.length > 0 && !selectedTaskExecutionUuid) {
      const inProgressTask = taskExecutions.find(te => te.status === "in_progress");
      setSelectedTaskExecutionUuid(inProgressTask?.uuid || taskExecutions[0].uuid);
    }
  }, [taskExecutions, selectedTaskExecutionUuid]);

  const selectedTaskExecution = taskExecutions.find(te => te.uuid === selectedTaskExecutionUuid);

  // Fetch the task definition for the selected task execution
  const { data: task } = useQuery<Task>({
    queryKey: ["/task/", selectedTaskExecution?.task_uuid],
    queryFn: async () => {
      if (!selectedTaskExecution?.task_uuid) return null;
      const response = await apiRequest(`/task/${selectedTaskExecution.task_uuid}`);
      // Transform snake_case API response to camelCase for frontend
      if (response) {
        return {
          ...response,
          dependsOn: response.depends_on || response.dependsOn || null,
          callbackFns: response.callback_fns || response.callbackFns || null,
          taskInputs: response.task_inputs || response.taskInputs || null,
        };
      }
      return response;
    },
    enabled: !!selectedTaskExecution?.task_uuid,
  });

  // Parse task inputs from the task definition
  const taskInputFields: TaskInputField[] = (() => {
    if (!task?.taskInputs) return [];
    
    try {
      // Handle if taskInputs is already parsed
      if (typeof task.taskInputs === 'object' && task.taskInputs !== null) {
        const taskInputsObj = task.taskInputs as any;
        // Check if it has fields property
        if ('fields' in taskInputsObj && Array.isArray(taskInputsObj.fields)) {
          return taskInputsObj.fields;
        }
        // Otherwise assume it's an array
        if (Array.isArray(task.taskInputs)) {
          return task.taskInputs;
        }
      }
      
      // If it's a string, parse it
      if (typeof task.taskInputs === 'string') {
        const parsed = JSON.parse(task.taskInputs);
        if (parsed.fields && Array.isArray(parsed.fields)) {
          return parsed.fields;
        }
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      
      return [];
    } catch (e) {
      console.error('Error parsing task inputs:', e);
      return [];
    }
  })();

  // Create dynamic form schema based on task input fields
  const createFormSchema = () => {
    const schemaObject: Record<string, z.ZodTypeAny> = {};
    
    taskInputFields.forEach((field: TaskInputField) => {
      let fieldSchema: z.ZodTypeAny;
      
      switch (field.type) {
        case 'number':
          fieldSchema = z.coerce.number();
          if (field.min !== undefined && field.min !== null) {
            fieldSchema = (fieldSchema as z.ZodNumber).min(field.min);
          }
          if (field.max !== undefined && field.max !== null) {
            fieldSchema = (fieldSchema as z.ZodNumber).max(field.max);
          }
          break;
        case 'email':
          fieldSchema = z.string().email();
          break;
        case 'checklist':
          fieldSchema = z.array(z.string());
          break;
        case 'file_upload':
          fieldSchema = z.any(); // File uploads need special handling
          break;
        default:
          fieldSchema = z.string();
          if (field.min_length !== undefined && field.min_length !== null) {
            fieldSchema = (fieldSchema as z.ZodString).min(field.min_length);
          }
          if (field.max_length !== undefined && field.max_length !== null) {
            fieldSchema = (fieldSchema as z.ZodString).max(field.max_length);
          }
      }
      
      // Make field optional if not required
      if (!field.required) {
        fieldSchema = fieldSchema.optional();
      }
      
      schemaObject[field.name] = fieldSchema;
    });
    
    return z.object(schemaObject);
  };

  const formSchema = createFormSchema();
  type FormData = z.infer<typeof formSchema>;

  // Create default values, checking for existing results
  const getDefaultValues = () => {
    const defaults: Record<string, any> = {};
    
    taskInputFields.forEach((field) => {
      // Check if we have existing results from the task execution
      if (selectedTaskExecution?.result && typeof selectedTaskExecution.result === 'object') {
        // Results are stored as label:value, so find the value by label
        const existingValue = selectedTaskExecution.result[field.label];
        if (existingValue !== undefined && existingValue !== null) {
          defaults[field.name] = existingValue;
          return;
        }
      }
      
      // Default empty values
      defaults[field.name] = field.type === 'checklist' ? [] : '';
    });
    
    return defaults;
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  // Reset form when selected task execution changes
  useEffect(() => {
    if (selectedTaskExecution && taskInputFields.length > 0) {
      form.reset(getDefaultValues());
    }
  }, [selectedTaskExecution?.uuid, taskInputFields.length]);

  // Task execution completion mutation
  const completeTaskMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!selectedTaskExecution) throw new Error("No task execution selected");
      
      // Convert form data to result object with label:value pairs
      const result: Record<string, any> = {};
      taskInputFields.forEach((field) => {
        result[field.label] = data[field.name];
      });

      const payload = {
        uuid: selectedTaskExecution.uuid,
        result,
      };

      return await apiRequest(`/task-execution/complete`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: async () => {
      // Invalidate and refetch queries - wait for fresh data
      await queryClient.invalidateQueries({ queryKey: ["/task-execution/"] });
      await queryClient.refetchQueries({ queryKey: ["/workflow-execution/", executionUuid] });
      
      // Find the next task in the DAG based on dependencies (using fresh data)
      const updatedExecution = queryClient.getQueryData<WorkflowExecution>(["/workflow-execution/", executionUuid]);
      if (updatedExecution?.task_executions) {
        const taskExecutions = updatedExecution.task_executions;
        const completedTaskName = selectedTaskExecution?.name;
        
        if (!completedTaskName) {
          toast({
            title: "Task completed",
            description: "Task execution has been completed successfully.",
          });
          return;
        }
        
        // Find tasks that depend on the just-completed task
        const dependentTasks = taskExecutions.filter(te => {
          // Parse depends_on field (could be array of task names)
          const dependsOn = te.depends_on;
          if (!dependsOn) return false;
          
          // depends_on could be an array or a single value
          const dependencies = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
          
          // Check if this task depends on the completed task
          return dependencies.includes(completedTaskName);
        });
        
        // Among dependent tasks, find all that are ready (all dependencies completed)
        const readyTasks = dependentTasks.filter(te => {
          const dependsOn = te.depends_on;
          const dependencies = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
          
          // Check if all dependencies are completed
          const allDependenciesCompleted = dependencies.every(depName => {
            const depTask = taskExecutions.find(t => t.name === depName);
            return depTask?.status === "completed";
          });
          
          return allDependenciesCompleted && (te.status === "in_progress" || te.status === "not_started");
        });
        
        // Prioritize in_progress tasks over not_started
        const readyTask = readyTasks.find(te => te.status === "in_progress") || readyTasks.find(te => te.status === "not_started");
        
        if (readyTask) {
          // Auto-select the next task in the DAG
          setSelectedTaskExecutionUuid(readyTask.uuid);
          toast({
            title: "Task completed",
            description: "Loading next task...",
          });
        } else {
          // No dependent tasks ready, check for any in_progress task
          const inProgressTask = taskExecutions.find(te => te.status === "in_progress");
          
          if (inProgressTask) {
            setSelectedTaskExecutionUuid(inProgressTask.uuid);
            toast({
              title: "Task completed",
              description: "Loading next task...",
            });
          } else {
            // All tasks are complete or no next task available
            toast({
              title: "Task completed",
              description: "All tasks have been completed!",
            });
          }
        }
      } else {
        toast({
          title: "Task completed",
          description: "Task execution has been completed successfully.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete task execution",
        variant: "destructive",
      });
    },
  });

  // Cancel workflow execution mutation
  const cancelExecutionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/workflow-execution/cancel/${executionUuid}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/workflow-execution/", executionUuid] });
      toast({
        title: "Execution cancelled",
        description: "Workflow execution has been cancelled successfully.",
      });
      setShowCancelDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel workflow execution",
        variant: "destructive",
      });
      setShowCancelDialog(false);
    },
  });

  const handleTaskComplete = (data: FormData) => {
    completeTaskMutation.mutate(data);
  };

  const handleCancelExecution = () => {
    cancelExecutionMutation.mutate();
  };

  const getStatusIcon = (status: string) => {
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

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
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

  const calculateProgress = () => {
    if (taskExecutions.length === 0) return 0;
    const completedCount = taskExecutions.filter(te => 
      te.status === "completed" || te.status === "failed"
    ).length;
    return (completedCount / taskExecutions.length) * 100;
  };

  // Extract trip route data for trip_operator and trip_create_operator tasks
  const getTripRouteData = () => {
    // Check if current task is trip_operator or trip_create_operator
    if (!task || (task.operator !== "trip_operator" && task.operator !== "trip_create_operator")) {
      return null;
    }

    // Helper to check if an object (possibly nested or stringified) contains route data
    const hasRouteData = (obj: any, depth: number = 0): boolean => {
      if (!obj || depth > 3) return false;
      
      // Parse if stringified
      let data = obj;
      if (typeof obj === 'string') {
        try {
          data = JSON.parse(obj);
        } catch {
          return false;
        }
      }
      
      // Handle arrays - check each element
      if (Array.isArray(data)) {
        return data.some(item => hasRouteData(item, depth + 1));
      }
      
      // Check direct fields
      if (data.waypoints || data.Waypoints || 
          data.route_coordinates || data.RouteCoordinates ||
          data.route || data.Route || data.stops || data.Stops) {
        return true;
      }
      
      // Check nested structures (data/result/payload/output) and parse if needed
      const nestedPaths = ['data', 'result', 'payload', 'output'];
      for (const path of nestedPaths) {
        if (data[path]) {
          const nested = typeof data[path] === 'string' ? (() => {
            try { return JSON.parse(data[path]); } catch { return null; }
          })() : data[path];
          if (nested && hasRouteData(nested, depth + 1)) return true;
        }
      }
      
      return false;
    };

    // Find trip_route_calculation task execution
    // Look for tasks by name pattern or that have route calculation data
    const tripRouteCalc = taskExecutions.find(te => {
      // Check by name (case-insensitive)
      if (te.name && te.name.toLowerCase().includes("route_calculation")) {
        return true;
      }
      
      // Check if task has waypoints or route data in result (fallback for any naming)
      if (te.result && te.status === "completed") {
        if (hasRouteData(te.result)) return true;
      }
      
      return false;
    });

    if (!tripRouteCalc || !tripRouteCalc.result) {
      return null;
    }

    // Helper to recursively extract data from potentially nested or stringified result
    const extractData = (obj: any, keys: string[], depth: number = 0): any => {
      if (!obj || depth > 5) return null; // Prevent infinite recursion
      
      // Handle stringified JSON recursively
      let data = obj;
      if (typeof obj === 'string') {
        try {
          data = JSON.parse(obj);
          // Recursively process the parsed object
          return extractData(data, keys, depth + 1);
        } catch {
          return null;
        }
      }
      
      // Handle arrays
      if (Array.isArray(data)) {
        // Check if this array looks like coordinate/waypoint data
        // (array of arrays where inner arrays are numeric tuples)
        if (data.length > 0 && Array.isArray(data[0])) {
          const firstElement = data[0];
          // If first element is a 2+ element array of numbers, this is likely coordinate data
          if (firstElement.length >= 2 && 
              typeof firstElement[0] === 'number' && 
              typeof firstElement[1] === 'number') {
            return data; // Return the coordinate array
          }
        }
        
        // Otherwise, recurse into each element
        for (const item of data) {
          const result = extractData(item, keys, depth + 1);
          if (result) return result;
        }
        return null;
      }
      
      // Not an object - return null
      if (typeof data !== 'object' || data === null) {
        return null;
      }
      
      // Check direct keys first
      for (const key of keys) {
        if (data[key]) {
          const value = data[key];
          // If value is a string, try to parse it
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) return parsed;
            } catch {
              // Not JSON, continue
            }
          }
          if (Array.isArray(value)) return value;
        }
      }
      
      // If no direct match, recursively explore ALL object properties
      for (const [propKey, propValue] of Object.entries(data)) {
        if (propValue === null || propValue === undefined) continue;
        
        // Parse if stringified
        let nested = propValue;
        if (typeof propValue === 'string') {
          try {
            nested = JSON.parse(propValue);
          } catch {
            continue; // Not JSON, skip this property
          }
        }
        
        // Recursively extract from nested object or array
        if (nested && (typeof nested === 'object' || Array.isArray(nested))) {
          const result = extractData(nested, keys, depth + 1);
          if (result) return result;
        }
      }
      
      return null;
    };

    // Extract waypoints and route_coordinates from result
    const waypoints = extractData(tripRouteCalc.result, ['waypoints', 'Waypoints', 'stops', 'Stops']);
    const routeCoordinates = extractData(tripRouteCalc.result, [
      'route_coordinates', 
      'RouteCoordinates', 
      'route', 
      'Route',
      'polyline',
      'Polyline'
    ]);

    // Validate waypoints is an array
    if (!waypoints || !Array.isArray(waypoints)) {
      return null;
    }

    return {
      waypoints,
      routeCoordinates: routeCoordinates && Array.isArray(routeCoordinates) ? routeCoordinates : undefined,
    };
  };

  const tripRouteData = getTripRouteData();

  // Extract customer location data for trip_stop tasks
  const getCustomerLocationData = () => {
    // Check if current task is trip_stop or trip_stop_operator
    if (!task || (task.operator !== "trip_stop" && task.operator !== "trip_stop_operator")) {
      return null;
    }

    // Extract customer coordinates from task.taskInputs.data.customer.coordinates
    try {
      let taskInputsData: any = task.taskInputs;
      
      console.log("trip_stop task.taskInputs:", taskInputsData);
      
      // Parse if string
      if (typeof taskInputsData === 'string') {
        taskInputsData = JSON.parse(taskInputsData);
      }

      // Ensure it's an object now
      if (typeof taskInputsData !== 'object' || taskInputsData === null) {
        console.log("task_inputs is not an object");
        return null;
      }

      // Navigate to data.customer.coordinates
      const data = taskInputsData.data;
      if (!data) {
        console.log("No data field in task_inputs");
        return null;
      }

      const customer = data.customer;
      if (!customer) {
        console.log("No customer field in data");
        return null;
      }

      const coordinates = customer.coordinates;
      if (!coordinates) {
        console.log("No coordinates found");
        return null;
      }

      let coordArray: [number, number];

      // Handle coordinates as string "lat,lon"
      if (typeof coordinates === 'string') {
        const parts = coordinates.split(',').map(s => s.trim());
        if (parts.length !== 2) {
          console.log("Invalid coordinate string format:", coordinates);
          return null;
        }
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) {
          console.log("Cannot parse coordinates to numbers:", coordinates);
          return null;
        }
        coordArray = [lat, lon];
      } 
      // Handle coordinates as array [lat, lon]
      else if (Array.isArray(coordinates) && coordinates.length >= 2) {
        if (typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') {
          console.log("Coordinates array contains non-numbers:", coordinates);
          return null;
        }
        coordArray = [coordinates[0], coordinates[1]];
      } else {
        console.log("Invalid coordinates format:", coordinates);
        return null;
      }

      console.log("Successfully extracted customer location:", {
        coordinates: coordArray,
        customerName: customer.full_name || customer.company_name || customer.name
      });

      return {
        coordinates: coordArray,
        customerName: customer.full_name || customer.company_name || customer.name || undefined,
      };
    } catch (error) {
      console.error("Error extracting customer location:", error);
      return null;
    }
  };

  const customerLocationData = getCustomerLocationData();

  // Context for creating an order at a trip stop (customer + trip_stop from the task inputs)
  const getTripStopOrderContext = () => {
    if (!task || (task.operator !== "trip_stop" && task.operator !== "trip_stop_operator")) {
      return null;
    }
    try {
      let ti: any = task.taskInputs;
      if (typeof ti === "string") ti = JSON.parse(ti);
      const data = ti?.data;
      const customer = data?.customer;
      if (!customer?.uuid) return null;
      return {
        customerUuid: customer.uuid as string,
        customerName: (customer.company_name || customer.full_name || customer.name) as string | undefined,
        tripStopUuid: data?.trip_stop_uuid as string | undefined,
      };
    } catch {
      return null;
    }
  };
  const orderContext = getTripStopOrderContext();

  const renderFormField = (field: TaskInputField) => {
    const key = field.name;

    switch (field.type) {
      case 'select':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <Select onValueChange={formField.onChange} value={formField.value}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-${key}`}>
                      <SelectValue placeholder={field.placeholder || "Select an option"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'checklist':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={() => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <div className="space-y-2">
                  {field.options?.map((option) => (
                    <FormField
                      key={option}
                      control={form.control}
                      name={key as any}
                      render={({ field: formField }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox
                              data-testid={`checkbox-${key}-${option}`}
                              checked={(formField.value as string[])?.includes(option)}
                              onCheckedChange={(checked) => {
                                const current = formField.value as string[] || [];
                                if (checked) {
                                  formField.onChange([...current, option]);
                                } else {
                                  formField.onChange(current.filter((v: string) => v !== option));
                                }
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">{option}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'radio':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={formField.onChange}
                    value={formField.value}
                    data-testid={`radio-${key}`}
                  >
                    {field.options?.map((option) => (
                      <div key={option} className="flex items-center space-x-2">
                        <RadioGroupItem value={option} id={`${key}-${option}`} />
                        <Label htmlFor={`${key}-${option}`}>{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'number':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    data-testid={`input-${key}`}
                    {...formField}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'date':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    data-testid={`input-${key}`}
                    {...formField}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'time':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    data-testid={`input-${key}`}
                    {...formField}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'email':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder={field.placeholder}
                    data-testid={`input-${key}`}
                    {...formField}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'password':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={field.placeholder}
                    data-testid={`input-${key}`}
                    {...formField}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'file_upload':
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    multiple={field.multiple}
                    accept={field.accept}
                    data-testid={`input-${key}`}
                    onChange={(e) => formField.onChange(e.target.files)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      default:
        return (
          <FormField
            key={key}
            control={form.control}
            name={key as any}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </FormLabel>
                <FormControl>
                  {field.rows && field.rows > 1 ? (
                    <Textarea
                      placeholder={field.placeholder}
                      rows={field.rows}
                      data-testid={`textarea-${key}`}
                      {...formField}
                    />
                  ) : (
                    <Input
                      type="text"
                      placeholder={field.placeholder}
                      data-testid={`input-${key}`}
                      {...formField}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );
    }
  };

  const isLoading = executionLoading;

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="container mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/workflow-execution/${workflowUuid}`}>
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Workflow Execution
                </h1>
                {workflowExecution && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {workflowExecution.name || workflowExecution.uuid}
                  </p>
                )}
              </div>
            </div>
            {workflowExecution && (
              <div className="flex items-center gap-3">
                {workflowExecution.status !== "completed" && 
                 workflowExecution.status !== "cancelled" && 
                 workflowExecution.status !== "failed" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowCancelDialog(true)}
                    disabled={cancelExecutionMutation.isPending}
                    data-testid="button-cancel-execution"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    {cancelExecutionMutation.isPending ? "Cancelling..." : "Cancel Execution"}
                  </Button>
                )}
                <Badge variant={getStatusBadgeVariant(workflowExecution.status)}>
                  {workflowExecution.status}
                </Badge>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Workflow Execution Info */}
              {workflowExecution && (
                <Card>
                  <CardHeader>
                    <CardTitle>Execution Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Started</p>
                      <p className="font-medium">{formatDate(workflowExecution.start_time)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Ended</p>
                      <p className="font-medium">{formatDate(workflowExecution.end_time)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Created By</p>
                      <p className="font-medium">{workflowExecution.created_by_uuid || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                      <p className="font-medium">{workflowExecution.status}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Task Execution Progress */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Task Execution Progress</CardTitle>
                    <span className="text-sm text-gray-500">
                      {Math.round(calculateProgress())}% Complete
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <TaskExecutionProgress
                    taskExecutions={taskExecutions}
                    selectedTaskExecutionUuid={selectedTaskExecutionUuid}
                    onSelectTaskExecution={setSelectedTaskExecutionUuid}
                  />
                </CardContent>
              </Card>

              {/* Selected Task Execution Form */}
              {selectedTaskExecution && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedTaskExecution.name || "Task Execution"}
                    </CardTitle>
                    <p className="text-sm text-gray-500">
                      {selectedTaskExecution.status === "completed" ? (
                        "This task has been completed. You can view the results below or update them."
                      ) : selectedTaskExecution.status === "failed" ? (
                        <span className="text-red-500">
                          Task failed: {selectedTaskExecution.error_message || "Unknown error"}
                        </span>
                      ) : (
                        "Complete the form below to finish this task."
                      )}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {/* Trip Operator Map */}
                    {tripRouteData && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                          Trip Route
                        </h3>
                        <TripOperatorMap
                          waypoints={tripRouteData.waypoints}
                          routeCoordinates={tripRouteData.routeCoordinates}
                        />
                      </div>
                    )}

                    {/* Customer Location Map for trip_stop */}
                    {customerLocationData && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                          Customer Location
                        </h3>
                        <CustomerLocationMap
                          coordinates={customerLocationData.coordinates}
                          customerName={customerLocationData.customerName}
                        />
                      </div>
                    )}

                    {/* Recent order history + create an order for this trip stop's customer */}
                    {orderContext && (
                      <div className="mb-6">
                        <CustomerRecentOrders customerUuid={orderContext.customerUuid} tripStopUuid={orderContext.tripStopUuid} />
                        <CreateOrderDialog
                          customerUuid={orderContext.customerUuid}
                          customerName={orderContext.customerName}
                          tripStopUuid={orderContext.tripStopUuid}
                        />
                      </div>
                    )}

                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleTaskComplete)} className="space-y-6">
                        {taskInputFields.length > 0 ? (
                          taskInputFields.map((field) => renderFormField(field))
                        ) : (
                          <div className="text-center text-gray-500 py-4">
                            No input fields defined for this task.
                          </div>
                        )}

                        <Button
                          type="submit"
                          disabled={
                            completeTaskMutation.isPending ||
                            selectedTaskExecution.status === "failed"
                          }
                          data-testid="button-complete-task"
                        >
                          {completeTaskMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {selectedTaskExecution.status === "completed" ? "Updating..." : "Completing..."}
                            </>
                          ) : selectedTaskExecution.status === "completed" ? (
                            "Update Task"
                          ) : (
                            "Complete Task"
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Cancel Execution Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Workflow Execution?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this workflow execution? This action cannot be undone.
              All in-progress tasks will be stopped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog-close">
              No, Keep Running
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelExecution}
              disabled={cancelExecutionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-cancel-dialog-confirm"
            >
              {cancelExecutionMutation.isPending ? "Cancelling..." : "Yes, Cancel Execution"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
