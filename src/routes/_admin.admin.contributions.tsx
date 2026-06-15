import { createFileRoute } from "@tanstack/react-router";
import { PaymentMonitoringPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/contributions")({
  component: () => (
    <PaymentMonitoringPage
      title="Contributions"
      description="Monitor prepared Hubtel contribution payments. Real payment collection is not enabled yet."
      emptyText="No contribution payment transactions have been initiated yet."
    />
  ),
});
