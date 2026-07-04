import { useEffect, useRef } from "react";
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

  // keep the selected circle visible (e.g. a freshly added ad-hoc stop)
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedTaskExecutionUuid || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-testid="progress-task-${selectedTaskExecutionUuid}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedTaskExecutionUuid, orderedTasks.length]);

  if (orderedTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No tasks to display
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto py-8" ref={containerRef}>
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

  // Graph keyed by uuid (names can collide, e.g. two ad-hoc stops for the
  // same customer). depends_on refers to task NAMES, so resolve names to uuids.
  const byUuid = new Map<string, TaskExecution>(tasks.map((t) => [t.uuid, t]));
  const uuidsByName = new Map<string, string[]>();
  tasks.forEach((t) => {
    const name = t.name || t.uuid;
    if (!uuidsByName.has(name)) uuidsByName.set(name, []);
    uuidsByName.get(name)!.push(t.uuid);
  });

  const inDegree = new Map<string, number>(tasks.map((t) => [t.uuid, 0]));
  const dependents = new Map<string, Set<string>>(tasks.map((t) => [t.uuid, new Set<string>()]));
  tasks.forEach((t) => {
    (t.depends_on || []).forEach((depName) => {
      (uuidsByName.get(depName) || []).forEach((depUuid) => {
        dependents.get(depUuid)!.add(t.uuid);
        inDegree.set(t.uuid, (inDegree.get(t.uuid) || 0) + 1);
      });
    });
  });

  // Kahn's algorithm; among available tasks always pick the earliest-created,
  // so dynamically added tasks (ad-hoc stops) land in chronological position
  // instead of being pushed to the front of the bar.
  const createdAt = (u: string) => new Date((byUuid.get(u) as any)?.created_at || 0).getTime();
  const available: string[] = tasks.filter((t) => inDegree.get(t.uuid) === 0).map((t) => t.uuid);
  const result: TaskExecution[] = [];
  while (available.length > 0) {
    available.sort((a, b) => createdAt(a) - createdAt(b));
    const current = available.shift()!;
    result.push(byUuid.get(current)!);
    dependents.get(current)!.forEach((next) => {
      const degree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) available.push(next);
    });
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

  // keep the explicit finish step visually last
  const finishIdx = result.findIndex((t) => t.name === "finish_trip");
  if (finishIdx >= 0 && finishIdx !== result.length - 1) {
    result.push(...result.splice(finishIdx, 1));
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
