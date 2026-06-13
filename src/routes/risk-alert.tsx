import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/risk-alert")({
  component: RiskAlertPage,
});

function RiskAlertPage() {
  const riskAlerts: Array<never> = [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Risk Alerts" subtitle={`${riskAlerts.length} active`} back="/home" />

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="rounded-3xl border border-border bg-card p-5 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="mt-3 font-display text-sm font-semibold">No active risk alerts</p>
          <p className="mt-1 text-xs text-muted-foreground">Risk alerts will appear here when real Supabase data requires attention.</p>
        </div>

        <Link to="/home" className="mt-auto rounded-2xl bg-gradient-primary py-4 text-center font-display text-sm font-semibold text-primary-foreground shadow-card">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
