import { createFileRoute } from "@tanstack/react-router";
import { AuditLogPage } from "@/admin";

export const Route = createFileRoute("/_admin/admin/activity")({
  component: AuditLogPage,
});
