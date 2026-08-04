import { createFileRoute } from "@tanstack/react-router";
import { GovernanceRiskPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/risk")({
  component: GovernanceRiskPage,
});
