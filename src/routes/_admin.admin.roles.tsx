import { createFileRoute } from "@tanstack/react-router";
import { RoleManagement } from "@/admin";

export const Route = createFileRoute("/_admin/admin/roles")({
  component: RoleManagement,
});
