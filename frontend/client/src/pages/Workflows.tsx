import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/queryClient";
import type { Workflow } from "@shared/schema";

interface WorkflowPage {
  workflows: Workflow[];
  total_count: number;
  page: number;
  per_page: number;
  pages: number;
}

interface WorkflowFilters {
  name?: string;
  tags?: string;
  page: number;
  per_page: number;
}

export default function Workflows() {
  const [filters, setFilters] = useState<WorkflowFilters>({
    page: 1,
    per_page: 20,
  });

  const { data: workflowPage, isLoading } = useQuery<WorkflowPage>({
    queryKey: ["/workflow/", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      return await apiRequest(`/workflow/?${params.toString()}`);
    },
  });

  const workflows = workflowPage?.workflows || [];
  const totalPages = workflowPage?.pages || 1;
  const currentPage = workflowPage?.page || 1;

  const handleFilterChange = (key: keyof WorkflowFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="container mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Workflows</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Manage your business workflows
            </p>
          </div>
          <Link href="/workflows/new">
            <Button data-testid="button-create-workflow">
              <Plus className="me-2 h-4 w-4" />
              Create Workflow
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search by Name</label>
              <Input
                data-testid="input-search-name"
                placeholder="Search workflows..."
                value={filters.name || ""}
                onChange={(e) => handleFilterChange("name", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Filter by Tags</label>
              <Input
                data-testid="input-filter-tags"
                placeholder="e.g., coated_peanuts,distribution"
                value={filters.tags || ""}
                onChange={(e) => handleFilterChange("tags", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Per Page</label>
              <Select
                value={filters.per_page.toString()}
                onValueChange={(value) => handleFilterChange("per_page", value)}
              >
                <SelectTrigger data-testid="select-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Workflows Table */}
        <Card>
          {isLoading ? (
            <div className="p-12 text-center text-gray-500">Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No workflows found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Get started by creating your first workflow
              </p>
              <Link href="/workflows/new">
                <Button>
                  <Plus className="me-2 h-4 w-4" />
                  Create Workflow
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows.map((workflow) => (
                    <TableRow key={workflow.uuid} data-testid={`row-workflow-${workflow.uuid}`}>
                      <TableCell className="font-medium">
                        <Link href={`/workflows/${workflow.uuid}`}>
                          <span className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                            {workflow.name}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {workflow.description || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {workflow.tags && workflow.tags.length > 0 ? (
                            workflow.tags.map((tag, idx) => (
                              <Badge key={idx} variant="secondary">
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {workflow.createdAt
                          ? new Date(workflow.createdAt).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/workflows/${workflow.uuid}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-${workflow.uuid}`}>
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

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
        </div>
      </div>
    </AppLayout>
  );
}
