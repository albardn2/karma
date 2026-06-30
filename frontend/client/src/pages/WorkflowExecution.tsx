import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { GitBranch, Calendar, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import type { Workflow } from "@shared/schema";

interface WorkflowsResponse {
  workflows: Workflow[];
  total_count: number;
}

export default function WorkflowExecution() {
  const { data: workflowsData, isLoading } = useQuery<WorkflowsResponse>({
    queryKey: ["/workflow/"],
  });

  const workflows = workflowsData?.workflows || [];

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Workflow Execution
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Execute and monitor your workflows
          </p>
        </div>

        {/* Workflows Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-16">
            <GitBranch className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No workflows available
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first workflow to get started
            </p>
            <Link href="/workflows/new">
              <Button data-testid="button-create-first-workflow">
                <GitBranch className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((workflow) => (
              <Link
                key={workflow.uuid}
                href={`/workflow-execution/${workflow.uuid}`}
              >
                <Card
                  className="hover:shadow-lg transition-all cursor-pointer group hover:border-primary"
                  data-testid={`workflow-widget-${workflow.name}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate group-hover:text-primary transition-colors">
                          {workflow.name}
                        </CardTitle>
                        {workflow.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {workflow.description}
                          </p>
                        )}
                      </div>
                      <GitBranch className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0 ml-2" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Tags */}
                    {workflow.tags && workflow.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        <Tag className="h-3 w-3 text-gray-400 mr-1 mt-0.5" />
                        {workflow.tags.slice(0, 3).map((tag, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="text-xs px-2 py-0"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {workflow.tags.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{workflow.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="space-y-1 text-xs text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1.5" />
                        <span>
                          Created{" "}
                          {workflow.createdAt
                            ? new Date(workflow.createdAt).toLocaleDateString()
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
