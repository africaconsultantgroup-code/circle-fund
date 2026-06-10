import { createFileRoute } from "@tanstack/react-router";
import { AdminLogin } from "@/admin";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});
