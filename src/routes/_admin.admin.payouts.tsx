import { createFileRoute } from "@tanstack/react-router";
import { PayoutOperationsPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/payouts")({
  component: PayoutOperationsPage,
});
