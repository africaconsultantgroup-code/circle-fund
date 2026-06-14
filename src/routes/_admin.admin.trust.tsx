import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/trust")({
  component: () => (
    <AdminSectionPage
      title="Trust"
      description="Review verification and trust readiness using live user verification records."
      metricLabel="Verified users"
      metricValue={(overview) => overview.metrics.verifiedUsers}
    />
  ),
});
