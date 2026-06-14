import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/support")({
  component: () => (
    <AdminSectionPage
      title="Support"
      description="Support workspace for customer account and verification review workflows."
      metricLabel="Pending verifications"
      metricValue={(overview) => overview.metrics.pendingVerifications}
    />
  ),
});
