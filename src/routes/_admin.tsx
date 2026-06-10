import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/admin";

export const Route = createFileRoute("/_admin")({
  component: AdminLayout,
});
