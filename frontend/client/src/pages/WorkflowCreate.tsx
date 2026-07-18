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
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { t } = useLanguage();
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
          throw new Error(t('workflows.invalidJsonParameters'));
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
        title: t('common.success'),
        description: t('workflows.createdSuccess'),
      });

      setLocation(`/workflows/${data.uuid}`);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('workflows.createFailed'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('workflows.validationError'),
        description: t('workflows.nameRequired'),
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
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('workflows.createWorkflow')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {t('workflows.createSubtitle')}
            </p>
          </div>
        </div>

        {/* Workflow Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t('workflows.workflowInformation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">{t('common.name')} *</Label>
                <Input
                  id="name"
                  data-testid="input-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t('workflows.namePlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('common.description')}</Label>
                <Textarea
                  id="description"
                  data-testid="input-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t('workflows.descriptionPlaceholder')}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">{t('workflows.tagsCommaSeparated')}</Label>
                <Input
                  id="tags"
                  data-testid="input-tags"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData({ ...formData, tags: e.target.value })
                  }
                  placeholder={t('workflows.tagsPlaceholder')}
                />
                <p className="text-sm text-gray-500">
                  {t('workflows.availableTags')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parameters">{t('workflows.parametersJson')}</Label>
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
                  {t('workflows.callbackFunctionsCommaSeparated')}
                </Label>
                <Input
                  id="callbacks"
                  data-testid="input-callbacks"
                  value={formData.callbackFns}
                  onChange={(e) =>
                    setFormData({ ...formData, callbackFns: e.target.value })
                  }
                  placeholder={t('workflows.callbacksPlaceholder')}
                />
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit"
                >
                  <Save className="h-4 w-4 me-2" />
                  {createMutation.isPending ? t('common.creating') : t('workflows.createWorkflow')}
                </Button>
                <Link href="/workflows">
                  <Button variant="outline" type="button" data-testid="button-cancel">
                    {t('common.cancel')}
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
