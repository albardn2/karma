import { ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";

/**
 * The wrapper every dashboard page renders inside.
 *
 * Standalone (the default) it is the usual full page: AppLayout plus the
 * scrolling padded container. Embedded, it is just a section — the Home feed
 * stacks many dashboards inside ONE scrolling page, so each panel must bring
 * its content (title, controls, cards) but not its own chrome.
 */
export function DashboardShell({
  embedded,
  children,
}: {
  embedded?: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return <section className="space-y-6">{children}</section>;
  }
  return (
    <AppLayout>
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">{children}</div>
    </AppLayout>
  );
}
