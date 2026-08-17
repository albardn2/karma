import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import WorkflowExecutionDetail from "@/pages/WorkflowExecutionDetail";

/**
 * The Distribution module: the trips list, one click from the menu.
 *
 * Distribution is the only workflow anyone runs from the web, so making people
 * pick it out of a list of workflows first was a step that never had a second
 * option. This resolves the trip workflow BY NAME and renders its executions
 * directly — the same thing the Expo app's distribution tile does
 * (expo_app/app/distribution.tsx), so the two clients agree on what
 * "distribution" opens.
 *
 * Resolved by name rather than a hardcoded uuid because the workflow is seeded
 * per tenant: every account has its own row with its own uuid, and only the
 * name is stable across them.
 */
const TRIP_WORKFLOW_NAME = "simple_trip_workflow";

interface WorkflowsResponse {
  workflows: { uuid: string; name: string }[];
}

export default function Distribution() {
  const { t } = useLanguage();

  const { data, isLoading, isError } = useQuery<WorkflowsResponse>({
    queryKey: ["/workflow/", TRIP_WORKFLOW_NAME],
    queryFn: () => apiRequest(`/workflow/?name=${TRIP_WORKFLOW_NAME}&per_page=1`),
    // the tenant's trip workflow is seeded once and never renamed
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </AppLayout>
    );
  }

  // A lookup that FAILED is not the same as an account with no workflow. Both
  // leave data undefined, so without this branch a backend outage would tell a
  // perfectly provisioned tenant to go ask an administrator to provision it —
  // sending them, and whoever they escalate to, hunting in the wrong place.
  if (isError) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            {t("distribution.workflowLoadFailed")}
          </p>
        </div>
      </AppLayout>
    );
  }

  const workflowUuid = data?.workflows?.[0]?.uuid;

  if (!workflowUuid) {
    // An account whose workflows were never provisioned. Say which workflow is
    // missing rather than showing an empty trip list, which would read as
    // "no trips yet" and send someone hunting in the wrong place.
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            {t("distribution.workflowMissing")}
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <WorkflowExecutionDetail
      workflowUuid={workflowUuid}
      showBack={false}
      title={t("nav.distribution")}
    />
  );
}
