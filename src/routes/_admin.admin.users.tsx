import { createFileRoute } from "@tanstack/react-router";
import { UserManagement } from "@/admin";

export const Route = createFileRoute("/_admin/admin/users")({
  component: UserManagement,
});
