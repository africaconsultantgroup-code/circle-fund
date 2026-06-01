import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { riskAlerts } from "@/lib/mock-data";
import { AlertTriangle, ShieldAlert, Info } from "lucide-react";

export const Route = createFileRoute("/risk-alert")({
  component: RiskAlertPage,
});

const sevMap = {
  high: { cls: "border-destructive/30 bg-destructive/5 text-destructive", Icon: ShieldAlert, label: "High" },
  medium: { cls: "border-gold/40 bg-gold/10 text-[color:var(--gold-foreground)]", Icon: AlertTriangle, label: "Medium" },
  low: { cls: "border-primary/20 bg-secondary text-primary", Icon: Info, label: "Low" },
} as const;

function RiskAlertPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Risk Alerts" subtitle={`${riskAlerts.length} active`} back="/home" />

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-3 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <p className="font-display text-sm font-semibold">Action required</p>
          </div>
          <p className="mt-2 text-xs text-foreground">A late contribution and a low score limit your access to high-value circles. Take action to protect your trust score.</p>
        </div>

        <ul className="flex flex-col gap-3">
          {riskAlerts.map((a) => {
            const { cls, Icon, label } = sevMap[a.severity];
            return (
              <li key={a.id} className={`rounded-2xl border p-4 ${cls}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <p className="font-display text-sm font-semibold">{a.title}</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase">{label}</span>
                </div>
                <p className="mt-2 text-xs text-foreground/80">{a.body}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wide opacity-70">{a.time}</p>
              </li>
            );
          })}
        </ul>

        <Link to="/trust-score" className="mt-2 rounded-2xl bg-gradient-primary py-4 text-center font-display text-sm font-semibold text-primary-foreground shadow-card">
          View trust score
        </Link>
      </div>
    </div>
  );
}