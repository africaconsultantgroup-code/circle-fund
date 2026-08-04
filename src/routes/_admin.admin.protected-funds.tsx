import { createFileRoute } from "@tanstack/react-router";
import { ProtectedFundsPage } from "@/admin/pages/ProtectedFundsPage";

export const Route = createFileRoute("/_admin/admin/protected-funds")({
  component: ProtectedFundsPage,
});
