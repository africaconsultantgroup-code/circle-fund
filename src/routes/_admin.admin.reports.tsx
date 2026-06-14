import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/reports")({
  component: () => (
    <AdminSectionPage
      title="Reports"
      description="Reporting workspace for live user, verification, circle, and membership totals."
      metricLabel="Total users"
      metricValue={(overview) => overview.metrics.totalUsers}
    />
  ),
});
