import { createFileRoute } from "@tanstack/react-router";
import { CustomerAppShell } from "@/customer/layouts/CustomerAppShell";

export const Route = createFileRoute("/_app")({
  component: CustomerAppShell,
});
