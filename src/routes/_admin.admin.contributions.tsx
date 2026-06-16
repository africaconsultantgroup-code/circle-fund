import { createFileRoute } from "@tanstack/react-router";
import { PaymentMonitoringPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/contributions")({
  component: () => (
    <PaymentMonitoringPage
      title="Contributions"
      description="Monitor Hubtel contribution payments, pending confirmations, and successful receipts."
      emptyText="No contribution payment transactions have been initiated yet."
    />
  ),
});
