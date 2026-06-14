import { createFileRoute } from "@tanstack/react-router";
import { CircleManagement } from "@/admin";

export const Route = createFileRoute("/_admin/admin/circles")({
  component: CircleManagement,
});
