import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/risk")({
  component: () => (
    <AdminSectionPage
      title="Risk"
      description="Monitor suspended accounts and pending verification signals from live operational data."
      metricLabel="Suspended users"
      metricValue={(overview) => overview.metrics.suspendedUsers}
    />
  ),
});
