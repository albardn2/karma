import { Check, X, Clock, Circle } from "lucide-react";
import type { TaskExecution } from "@/types/taskExecution";

interface TaskExecutionProgressProps {
  taskExecutions: TaskExecution[];
  selectedTaskExecutionUuid: string | null;
  onSelectTaskExecution: (uuid: string) => void;
}

export function TaskExecutionProgress({
  taskExecutions,
  selectedTaskExecutionUuid,
  onSelectTaskExecution,
}: TaskExecutionProgressProps) {
  // Topological sort to order tasks based on depends_on
  const orderedTasks = topologicalSort(taskExecutions);

  if (orderedTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No tasks to display
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto py-8">
      <div className="flex items-center justify-center min-w-max px-8">
        {orderedTasks.map((task, index) => (
          <div key={task.uuid} className="flex items-center">
            {/* Task Step */}
            <div className="flex flex-col items-center">
              {/* Circle with status */}
              <button
                onClick={() => onSelectTaskExecution(task.uuid)}
                className={`
                  relative w-12 h-12 rounded-full border-4 flex items-center justify-center
                  transition-all cursor-pointer hover:scale-110
                  ${selectedTaskExecutionUuid === task.uuid
                    ? "border-blue-600 bg-blue-100 dark:bg-blue-900 shadow-lg"
                    : getStatusCircleClasses(task.status)
                  }
                `}
                data-testid={`progress-task-${task.uuid}`}
              >
                {getStatusIcon(task.status)}
              </button>
              
              {/* Task name below */}
              <div className="mt-3 text-center max-w-[120px]">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {task.name || "Task"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatStatus(task.status)}
                </p>
              </div>
            </div>

            {/* Connecting line (except for last task) */}
            {index < orderedTasks.length - 1 && (
              <div 
                className={`h-1 w-24 mx-2 ${getLineColor(task.status)}`}
                style={{ marginTop: '-40px' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function topologicalSort(tasks: TaskExecution[]): TaskExecution[] {
  if (tasks.length === 0) return [];

  // Build maps: name -> task and name -> dependents
  const taskByName = new Map<string, TaskExecution>();
  const dependents = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  // Initialize maps
  tasks.forEach((task) => {
    const name = task.name || task.uuid;
    taskByName.set(name, task);
    inDegree.set(name, 0);
    dependents.set(name, new Set());
  });

  // Build dependency graph based on task names in depends_on
  tasks.forEach((task) => {
    const name = task.name || task.uuid;
    const deps = task.depends_on || [];
    
    // Count how many valid dependencies this task has
    let validDepsCount = 0;
    deps.forEach((depName) => {
      if (taskByName.has(depName)) {
        validDepsCount++;
        // Add this task as a dependent of the dependency
        dependents.get(depName)!.add(name);
      }
    });
    
    inDegree.set(name, validDepsCount);
  });

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  const result: TaskExecution[] = [];

  // Start with tasks that have no dependencies
  inDegree.forEach((degree, name) => {
    if (degree === 0) {
      queue.push(name);
    }
  });

  while (queue.length > 0) {
    const currentName = queue.shift()!;
    const currentTask = taskByName.get(currentName);
    if (currentTask) {
      result.push(currentTask);
    }

    // Reduce in-degree for dependents
    const deps = dependents.get(currentName);
    if (deps) {
      deps.forEach((depName) => {
        const newDegree = inDegree.get(depName)! - 1;
        inDegree.set(depName, newDegree);
        if (newDegree === 0) {
          queue.push(depName);
        }
      });
    }
  }

  // If we couldn't process all tasks, there might be a cycle or missing dependencies
  // Append remaining tasks to ensure all executions are shown
  if (result.length < tasks.length) {
    tasks.forEach((task) => {
      if (!result.find((t) => t.uuid === task.uuid)) {
        result.push(task);
      }
    });
  }
  
  return result;
}

function getStatusCircleClasses(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
      return "border-green-500 bg-green-100 dark:bg-green-900";
    case "failed":
      return "border-red-500 bg-red-100 dark:bg-red-900";
    case "in_progress":
      return "border-blue-500 bg-blue-100 dark:bg-blue-900";
    case "not_started":
      return "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800";
    default:
      return "border-yellow-500 bg-yellow-100 dark:bg-yellow-900";
  }
}

function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
      return <Check className="h-6 w-6 text-green-600 dark:text-green-400" />;
    case "failed":
      return <X className="h-6 w-6 text-red-600 dark:text-red-400" />;
    case "in_progress":
      return <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />;
    case "not_started":
      return <Circle className="h-5 w-5 text-gray-400" />;
    default:
      return <Circle className="h-5 w-5 text-yellow-500" />;
  }
}

function getLineColor(fromStatus: string): string {
  switch (fromStatus.toLowerCase()) {
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "in_progress":
      return "bg-blue-500";
    default:
      return "bg-gray-300 dark:bg-gray-600";
  }
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
