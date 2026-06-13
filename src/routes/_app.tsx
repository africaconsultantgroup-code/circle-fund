import { createFileRoute } from "@tanstack/react-router";
import { CustomerAppShell } from "@/customer/layouts/CustomerAppShell";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/_app")({
  beforeLoad: requireAuth,
  component: CustomerAppShell,
});
