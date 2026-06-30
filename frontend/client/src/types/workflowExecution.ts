export enum WorkflowExecutionStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  SKIPPED = "skipped",
}

export const WorkflowExecutionStatusLabels: Record<WorkflowExecutionStatus, string> = {
  [WorkflowExecutionStatus.NOT_STARTED]: "Not Started",
  [WorkflowExecutionStatus.IN_PROGRESS]: "In Progress",
  [WorkflowExecutionStatus.COMPLETED]: "Completed",
  [WorkflowExecutionStatus.FAILED]: "Failed",
  [WorkflowExecutionStatus.CANCELLED]: "Cancelled",
  [WorkflowExecutionStatus.SKIPPED]: "Skipped",
};

import type { TaskExecution } from "./taskExecution";

export interface WorkflowExecution {
  uuid: string;
  workflow_uuid: string;
  status: WorkflowExecutionStatus;
  result?: Record<string, any>;
  parameters?: Record<string, any>;
  error_message?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_by_uuid?: string | null;
  created_at: string;
  tags?: string[];
  name?: string | null;
  task_executions?: TaskExecution[];
}

export interface WorkflowExecutionPage {
  workflow_executions: WorkflowExecution[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface WorkflowExecutionCreate {
  workflow_uuid: string;
  parameters?: Record<string, any>;
}
