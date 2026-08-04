import { createFileRoute } from "@tanstack/react-router";
import { AutomationMonitoringPage } from "@/admin/pages/AutomationMonitoringPage";

export const Route = createFileRoute("/_admin/admin/automations")({
  component: AutomationMonitoringPage,
});
