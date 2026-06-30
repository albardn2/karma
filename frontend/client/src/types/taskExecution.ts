export enum TaskExecutionStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  SKIPPED = "skipped",
}

export const TaskExecutionStatusLabels: Record<TaskExecutionStatus, string> = {
  [TaskExecutionStatus.NOT_STARTED]: "Not Started",
  [TaskExecutionStatus.IN_PROGRESS]: "In Progress",
  [TaskExecutionStatus.COMPLETED]: "Completed",
  [TaskExecutionStatus.FAILED]: "Failed",
  [TaskExecutionStatus.CANCELLED]: "Cancelled",
  [TaskExecutionStatus.SKIPPED]: "Skipped",
};

export interface TaskExecution {
  uuid: string;
  task_uuid: string;
  workflow_execution_uuid: string;
  status: string;
  result?: Record<string, any>;
  task_inputs?: Record<string, any>;
  error_message?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_by_uuid?: string | null;
  created_at: string;
  parent_task_execution_uuid?: string | null;
  name?: string | null;
  depends_on?: string[];
}

export interface TaskExecutionPage {
  task_executions: TaskExecution[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface TaskExecutionComplete {
  uuid: string;
  completed_by_uuid?: string | null;
  result?: Record<string, any>;
}
