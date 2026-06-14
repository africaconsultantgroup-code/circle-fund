import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/payouts")({
  component: () => (
    <AdminSectionPage
      title="Payouts"
      description="Track payout operations once payout records are connected. No wallet or payout execution is enabled here."
      metricLabel="Total circles"
      metricValue={(overview) => overview.metrics.totalCircles}
    />
  ),
});
