import { createFileRoute } from "@tanstack/react-router";
import { AdminSectionPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/activity")({
  component: () => (
    <AdminSectionPage
      title="Activity"
      description="Review recent operational activity across users, verifications, circles, and member records."
      metricLabel="Tracked users"
      metricValue={(overview) => overview.metrics.totalUsers}
    />
  ),
});
