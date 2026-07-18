import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TaskExecution } from "@/types/taskExecution";

interface TaskExecutionDAGProps {
  taskExecutions: TaskExecution[];
  selectedTaskExecutionUuid: string | null;
  onSelectTaskExecution: (uuid: string) => void;
}

interface TaskExecutionNode {
  taskExecution: TaskExecution;
  layer: number;
  x: number;
  y: number;
}

interface Edge {
  from: TaskExecutionNode;
  to: TaskExecutionNode;
}

const CARD_WIDTH = 280;
const CARD_HEIGHT = 120;
const LAYER_GAP = 350;
const VERTICAL_GAP = 40;
const PADDING = 40;

function calculateDAGLayout(taskExecutions: TaskExecution[]): { nodes: TaskExecutionNode[]; edges: Edge[] } {
  if (taskExecutions.length === 0) return { nodes: [], edges: [] };

  // Build dependency map using UUIDs
  const taskExecMap = new Map<string, TaskExecution>();
  taskExecutions.forEach((te) => taskExecMap.set(te.uuid, te));

  // Calculate layer for each task execution (topological sort)
  const layers = new Map<string, number>();
  const visited = new Set<string>();
  const temp = new Set<string>();

  function calculateLayer(uuid: string): number {
    if (layers.has(uuid)) return layers.get(uuid)!;
    if (temp.has(uuid)) return 0; // Cycle detection - treat as layer 0
    if (visited.has(uuid)) return layers.get(uuid) || 0;

    temp.add(uuid);
    const taskExec = taskExecMap.get(uuid);
    
    let maxDepLayer = -1;
    if (taskExec?.depends_on && taskExec.depends_on.length > 0) {
      taskExec.depends_on.forEach((depUuid) => {
        const depLayer = calculateLayer(depUuid);
        maxDepLayer = Math.max(maxDepLayer, depLayer);
      });
    }

    const layer = maxDepLayer + 1;
    temp.delete(uuid);
    visited.add(uuid);
    layers.set(uuid, layer);
    return layer;
  }

  // Calculate layers for all task executions
  taskExecutions.forEach((te) => calculateLayer(te.uuid));

  // Group task executions by layer
  const layerGroups = new Map<number, TaskExecution[]>();
  taskExecutions.forEach((te) => {
    const layer = layers.get(te.uuid) || 0;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(te);
  });

  // Position task executions
  const nodes: TaskExecutionNode[] = [];
  const maxLayer = Math.max(...Array.from(layers.values()));

  for (let layer = 0; layer <= maxLayer; layer++) {
    const teInLayer = layerGroups.get(layer) || [];
    const startY = PADDING;

    teInLayer.forEach((te, index) => {
      nodes.push({
        taskExecution: te,
        layer,
        x: PADDING + layer * LAYER_GAP,
        y: startY + index * (CARD_HEIGHT + VERTICAL_GAP),
      });
    });
  }

  // Calculate edges
  const edges: Edge[] = [];
  const nodeMap = new Map<string, TaskExecutionNode>();
  nodes.forEach((node) => nodeMap.set(node.taskExecution.uuid, node));

  nodes.forEach((toNode) => {
    if (toNode.taskExecution.depends_on && toNode.taskExecution.depends_on.length > 0) {
      toNode.taskExecution.depends_on.forEach((depUuid) => {
        const fromNode = nodeMap.get(depUuid);
        if (fromNode) {
          edges.push({ from: fromNode, to: toNode });
        }
      });
    }
  });

  return { nodes, edges };
}

function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "in_progress":
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    case "not_started":
      return <Clock className="h-5 w-5 text-gray-400" />;
    default:
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  }
}

function getStatusBackgroundColor(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
      return "bg-green-50 dark:bg-green-950";
    case "failed":
      return "bg-red-50 dark:bg-red-950";
    case "in_progress":
      return "bg-blue-50 dark:bg-blue-950";
    case "not_started":
      return "bg-white dark:bg-gray-800";
    default:
      return "bg-yellow-50 dark:bg-yellow-950";
  }
}

function getStatusBorderColor(status: string): string {
  switch (status.toLowerCase()) {
    case "completed":
      return "border-green-500";
    case "failed":
      return "border-red-500";
    case "in_progress":
      return "border-blue-500";
    case "not_started":
      return "border-gray-300 dark:border-gray-700";
    default:
      return "border-yellow-500";
  }
}

function getEdgeColor(fromStatus: string, toStatus: string): string {
  // If source is completed, show green
  if (fromStatus.toLowerCase() === "completed") {
    return "#22c55e";
  }
  // If source is in progress, show blue
  if (fromStatus.toLowerCase() === "in_progress") {
    return "#3b82f6";
  }
  // If source failed, show red
  if (fromStatus.toLowerCase() === "failed") {
    return "#ef4444";
  }
  // Default gray
  return "#94a3b8";
}

export function TaskExecutionDAG({ 
  taskExecutions, 
  selectedTaskExecutionUuid,
  onSelectTaskExecution 
}: TaskExecutionDAGProps) {
  const { t, te } = useLanguage();
  const { nodes, edges } = calculateDAGLayout(taskExecutions);

  if (taskExecutions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">{t('workflows.noTaskExecutions')}</p>
        <p className="text-sm text-gray-400">
          {t('workflows.taskExecutionsHint')}
        </p>
      </div>
    );
  }

  // Calculate SVG dimensions
  const maxX = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH + PADDING;
  const maxY = Math.max(...nodes.map((n) => n.y)) + CARD_HEIGHT + PADDING;

  return (
    <div className="w-full overflow-auto border rounded-lg bg-gray-50 dark:bg-gray-900" dir="ltr">
      <svg
        width={Math.max(maxX, 800)}
        height={Math.max(maxY, 400)}
        className="bg-white dark:bg-gray-950"
      >
        {/* Draw edges */}
        {edges.map((edge, idx) => {
          const fromX = edge.from.x + CARD_WIDTH;
          const fromY = edge.from.y + CARD_HEIGHT / 2;
          const toX = edge.to.x;
          const toY = edge.to.y + CARD_HEIGHT / 2;

          // Bezier curve for smooth connections
          const midX = (fromX + toX) / 2;
          const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
          
          const edgeColor = getEdgeColor(
            edge.from.taskExecution.status,
            edge.to.taskExecution.status
          );

          return (
            <g key={idx}>
              <path
                d={path}
                stroke={edgeColor}
                strokeWidth="2"
                fill="none"
                markerEnd={`url(#arrowhead-${idx})`}
              />
              <defs>
                <marker
                  id={`arrowhead-${idx}`}
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3, 0 6" fill={edgeColor} />
                </marker>
              </defs>
            </g>
          );
        })}

        {/* Draw task execution nodes */}
        {nodes.map((node) => {
          const isSelected = node.taskExecution.uuid === selectedTaskExecutionUuid;
          const statusBgColor = getStatusBackgroundColor(node.taskExecution.status);
          const statusBorderColor = getStatusBorderColor(node.taskExecution.status);
          
          const borderClass = isSelected 
            ? "border-4 border-blue-600 shadow-xl" 
            : `border-2 ${statusBorderColor}`;

          return (
            <g key={node.taskExecution.uuid}>
              <foreignObject
                x={node.x}
                y={node.y}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
              >
                <div
                  className={`h-full rounded-lg p-3 ${borderClass} ${statusBgColor} hover:shadow-lg transition-all cursor-pointer`}
                  onClick={() => onSelectTaskExecution(node.taskExecution.uuid)}
                  data-testid={`dag-task-execution-${node.taskExecution.uuid}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h4
                        className="font-medium text-sm truncate"
                        data-testid={`dag-text-task-name-${node.taskExecution.name}`}
                        title={node.taskExecution.name || t('workflows.unnamedTask')}
                      >
                        {node.taskExecution.name || t('workflows.unnamedTask')}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusIcon(node.taskExecution.status)}
                        <Badge variant="outline" className="text-xs">
                          {te(node.taskExecution.status)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {node.taskExecution.start_time && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {t('workflows.startedLabel', { time: new Date(node.taskExecution.start_time).toLocaleTimeString() })}
                    </p>
                  )}
                  {node.taskExecution.error_message && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2">
                      {t('workflows.errorLabel', { error: node.taskExecution.error_message })}
                    </p>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
