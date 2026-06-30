import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertWorkflowSchema } from "@shared/schema";

interface WorkflowFormData {
  name: string;
  description: string;
  tags: string;
  parameters: string;
  callbackFns: string;
}

export default function WorkflowCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<WorkflowFormData>({
    name: "",
    description: "",
    tags: "",
    parameters: "",
    callbackFns: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: WorkflowFormData) => {
      // Parse parameters as JSON if provided
      let parsedParameters = null;
      if (data.parameters.trim()) {
        try {
          parsedParameters = JSON.parse(data.parameters.trim());
        } catch (e) {
          throw new Error("Invalid JSON in parameters field");
        }
      }

      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        tags: data.tags
          ? data.tags.split(",").map((t) => t.trim()).filter((t) => t)
          : null,
        parameters: parsedParameters,
        callback_fns: data.callbackFns
          ? data.callbackFns.split(",").map((c) => c.trim()).filter((c) => c)
          : null,
      };

      return await apiRequest("/workflow/", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey[0] as string;
          return queryKey.includes("/workflow");
        },
      });

      toast({
        title: "Success",
        description: "Workflow created successfully",
      });

      setLocation(`/workflows/${data.uuid}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create workflow",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Workflow name is required",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/workflows">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Create Workflow
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Add a new workflow to your system
            </p>
          </div>
        </div>

        {/* Workflow Form */}
        <Card>
          <CardHeader>
            <CardTitle>Workflow Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Enter workflow name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  data-testid="input-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Enter workflow description"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  data-testid="input-tags"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData({ ...formData, tags: e.target.value })
                  }
                  placeholder="e.g., coated_peanuts, distribution"
                />
                <p className="text-sm text-gray-500">
                  Available tags: coated_peanuts, distribution
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parameters">Parameters (JSON)</Label>
                <Textarea
                  id="parameters"
                  data-testid="input-parameters"
                  value={formData.parameters}
                  onChange={(e) =>
                    setFormData({ ...formData, parameters: e.target.value })
                  }
                  placeholder='{"key": "value"}'
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="callbacks">
                  Callback Functions (comma-separated)
                </Label>
                <Input
                  id="callbacks"
                  data-testid="input-callbacks"
                  value={formData.callbackFns}
                  onChange={(e) =>
                    setFormData({ ...formData, callbackFns: e.target.value })
                  }
                  placeholder="e.g., function1, function2"
                />
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {createMutation.isPending ? "Creating..." : "Create Workflow"}
                </Button>
                <Link href="/workflows">
                  <Button variant="outline" type="button" data-testid="button-cancel">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
