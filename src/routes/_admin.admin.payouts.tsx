import { createFileRoute } from "@tanstack/react-router";
import { PaymentMonitoringPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/payouts")({
  component: () => (
    <PaymentMonitoringPage
      title="Payouts"
      description="Track payment-provider transaction readiness before payout execution is enabled. No wallet or payout execution is active."
      emptyText="No payment transactions are available yet."
    />
  ),
});
