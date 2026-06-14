import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/contributions")({
  component: () => (
    <AdminSectionPage
      title="Contributions"
      description="Monitor contribution readiness and circle participation. Payment collection is not enabled yet."
      metricLabel="Active circles"
      metricValue={(overview) => overview.metrics.activeCircles}
    />
  ),
});
