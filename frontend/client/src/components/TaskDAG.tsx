import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2 } from "lucide-react";
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
import type { Task } from "@shared/schema";

interface TaskDAGProps {
  tasks: Task[];
  onEditTask: (task?: Task) => void;
  onDeleteTask: (uuid: string) => void;
}

interface TaskNode {
  task: Task;
  layer: number;
  x: number;
  y: number;
}

interface Edge {
  from: TaskNode;
  to: TaskNode;
}

const CARD_WIDTH = 280;
const CARD_HEIGHT = 120;
const LAYER_GAP = 350;
const VERTICAL_GAP = 40;
const PADDING = 40;

function calculateDAGLayout(tasks: Task[]): { nodes: TaskNode[]; edges: Edge[] } {
  if (tasks.length === 0) return { nodes: [], edges: [] };

  // Build dependency map
  const taskMap = new Map<string, Task>();
  tasks.forEach((task) => taskMap.set(task.name, task));

  // Calculate layer for each task (topological sort)
  const layers = new Map<string, number>();
  const visited = new Set<string>();
  const temp = new Set<string>();

  function calculateLayer(taskName: string): number {
    if (layers.has(taskName)) return layers.get(taskName)!;
    if (temp.has(taskName)) return 0; // Cycle detection - treat as layer 0
    if (visited.has(taskName)) return layers.get(taskName) || 0;

    temp.add(taskName);
    const task = taskMap.get(taskName);
    
    let maxDepLayer = -1;
    if (task?.dependsOn && task.dependsOn.length > 0) {
      task.dependsOn.forEach((depName) => {
        const depLayer = calculateLayer(depName);
        maxDepLayer = Math.max(maxDepLayer, depLayer);
      });
    }

    const layer = maxDepLayer + 1;
    temp.delete(taskName);
    visited.add(taskName);
    layers.set(taskName, layer);
    return layer;
  }

  // Calculate layers for all tasks
  tasks.forEach((task) => calculateLayer(task.name));

  // Group tasks by layer
  const layerGroups = new Map<number, Task[]>();
  tasks.forEach((task) => {
    const layer = layers.get(task.name) || 0;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(task);
  });

  // Position tasks
  const nodes: TaskNode[] = [];
  const maxLayer = Math.max(...Array.from(layers.values()));

  for (let layer = 0; layer <= maxLayer; layer++) {
    const tasksInLayer = layerGroups.get(layer) || [];
    const layerHeight = tasksInLayer.length * (CARD_HEIGHT + VERTICAL_GAP) - VERTICAL_GAP;
    const startY = PADDING;

    tasksInLayer.forEach((task, index) => {
      nodes.push({
        task,
        layer,
        x: PADDING + layer * LAYER_GAP,
        y: startY + index * (CARD_HEIGHT + VERTICAL_GAP),
      });
    });
  }

  // Calculate edges
  const edges: Edge[] = [];
  const nodeMap = new Map<string, TaskNode>();
  nodes.forEach((node) => nodeMap.set(node.task.name, node));

  nodes.forEach((toNode) => {
    if (toNode.task.dependsOn && toNode.task.dependsOn.length > 0) {
      toNode.task.dependsOn.forEach((depName) => {
        const fromNode = nodeMap.get(depName);
        if (fromNode) {
          edges.push({ from: fromNode, to: toNode });
        }
      });
    }
  });

  return { nodes, edges };
}

export function TaskDAG({ tasks, onEditTask, onDeleteTask }: TaskDAGProps) {
  const { nodes, edges } = calculateDAGLayout(tasks);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No tasks yet</p>
        <p className="text-sm text-gray-400">
          Create your first task to get started
        </p>
      </div>
    );
  }

  // Calculate SVG dimensions
  const maxX = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH + PADDING;
  const maxY = Math.max(...nodes.map((n) => n.y)) + CARD_HEIGHT + PADDING;

  return (
    <div className="w-full overflow-auto border rounded-lg bg-gray-50 dark:bg-gray-900">
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

          return (
            <g key={idx}>
              <path
                d={path}
                stroke="#94a3b8"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Draw task nodes */}
        {nodes.map((node) => (
          <g key={node.task.uuid}>
            <foreignObject
              x={node.x}
              y={node.y}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
            >
              <div
                className="h-full border-2 border-gray-300 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-shadow"
                data-testid={`dag-task-${node.task.name}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h4
                      className="font-medium text-sm truncate"
                      data-testid={`dag-text-task-name-${node.task.name}`}
                      title={node.task.name}
                    >
                      {node.task.name}
                    </h4>
                    <Badge variant="outline" className="text-xs mt-1">
                      {node.task.operator}
                    </Badge>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEditTask(node.task)}
                      className="h-7 w-7 p-0"
                      data-testid={`dag-button-edit-${node.task.name}`}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          data-testid={`dag-button-delete-${node.task.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Task</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{node.task.name}"? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDeleteTask(node.task.uuid)}
                            className="bg-red-600 hover:bg-red-700"
                            data-testid={`dag-confirm-delete-${node.task.name}`}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                {node.task.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1">
                    {node.task.description}
                  </p>
                )}
                {node.task.callbackFns && node.task.callbackFns.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {node.task.callbackFns.slice(0, 2).map((cb, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-xs px-1 py-0"
                      >
                        {cb.length > 10 ? cb.slice(0, 10) + "..." : cb}
                      </Badge>
                    ))}
                    {node.task.callbackFns.length > 2 && (
                      <span className="text-xs text-gray-500">
                        +{node.task.callbackFns.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
    </div>
  );
}
