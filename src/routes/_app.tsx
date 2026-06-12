import { createFileRoute } from "@tanstack/react-router";
import { CustomerAppShell } from "@/customer/layouts/CustomerAppShell";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/_app")({
  beforeLoad: requireVerifiedPhone,
  component: CustomerAppShell,
});
