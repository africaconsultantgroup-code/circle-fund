import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/admin";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminDashboard,
});
