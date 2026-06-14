import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: () => (
    <AdminSectionPage
      title="Settings"
      description="Admin configuration area for operational controls and portal settings."
      metricLabel="Active circles"
      metricValue={(overview) => overview.metrics.activeCircles}
    />
  ),
});
