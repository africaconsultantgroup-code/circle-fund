import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Gavel,
  HeartPulse,
  Loader2,
  Scale,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  decideGovernanceRequest,
  loadGovernanceDashboard,
  type GovernanceDashboard,
  type GovernanceRequestItem,
} from "@/lib/governance";
import { formatCurrency } from "@/lib/diaspora";

export function GovernanceRiskPage() {
  const [dashboard, setDashboard] = useState<GovernanceDashboard | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    const result = await loadGovernanceDashboard();
    setDashboard(result.data);
    setError(result.error?.message ?? "");
  };

  useEffect(() => {
    // Initial Supabase hydration is this effect's external synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const decide = async (request: GovernanceRequestItem, decision: "approved" | "rejected") => {
    if (decisionReason.trim().length < 5) {
      setError("Enter a clear decision reason before approving or rejecting a request.");
      return;
    }
    setBusyId(request.id);
    setError("");
    const result = await decideGovernanceRequest(request.id, decision, decisionReason.trim());
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setDecisionReason("");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Operations governance
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Governance &amp; Risk
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Review requests, disputes, standing alerts, and Circle health. Decisions here cannot
          release, redirect, or edit protected funds.
        </p>
      </header>

      {error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!dashboard ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading governance controls
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Open requests" value={dashboard.summary.open_requests} />
            <Metric label="Removal reviews" value={dashboard.summary.removal_requests} />
            <Metric label="Disputes" value={dashboard.summary.pending_disputes} />
            <Metric label="Standing alerts" value={dashboard.summary.standing_alerts} />
            <Metric label="At-risk Circles" value={dashboard.summary.at_risk_circles} />
            <Metric label="Late payments" value={dashboard.summary.late_payments} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Open governance requests</h2>
            </div>
            <textarea
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              placeholder="Required decision reason and evidence assessment"
              className="mt-4 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
            <div className="mt-4 space-y-3">
              {dashboard.requests.length === 0 ? (
                <Empty text="No governance requests require review." />
              ) : (
                dashboard.requests.map((request) => (
                  <article key={request.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{request.circle_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {request.case_id} · {label(request.request_type)} ·{" "}
                          {label(request.reason_code)}
                        </p>
                      </div>
                      <Status value={request.status} />
                    </div>
                    {request.details && (
                      <p className="mt-3 text-sm text-muted-foreground">{request.details}</p>
                    )}
                    <div className="mt-4 flex gap-2">
                      <button
                        disabled={busyId === request.id}
                        onClick={() => void decide(request, "approved")}
                        className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success disabled:opacity-60"
                      >
                        {busyId === request.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        disabled={busyId === request.id}
                        onClick={() => void decide(request, "rejected")}
                        className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <RiskSection icon={<Scale />} title="Pending disputes">
              {dashboard.disputes.length === 0 ? (
                <Empty text="No disputes are awaiting review." />
              ) : (
                dashboard.disputes.map((item) => (
                  <Row
                    key={item.id}
                    title={item.title}
                    detail={`${item.case_id} · ${item.circle_name ?? "Account case"} · ${label(item.dispute_type)}`}
                    status={item.priority}
                  />
                ))
              )}
            </RiskSection>

            <RiskSection icon={<ShieldAlert />} title="Member standing alerts">
              {dashboard.standing_alerts.length === 0 ? (
                <Empty text="No member standing alerts." />
              ) : (
                dashboard.standing_alerts.map((item) => (
                  <Row
                    key={item.user_id}
                    title={item.member_name}
                    detail={`Score ${item.score} · ${item.missed_payment_count} missed · ${item.active_dispute_count} disputes`}
                    status={item.standing}
                  />
                ))
              )}
            </RiskSection>
          </div>

          <RiskSection icon={<HeartPulse />} title="Circle health">
            {dashboard.circle_health.length === 0 ? (
              <Empty text="Circle health will appear as contribution schedules are assessed." />
            ) : (
              dashboard.circle_health.map((item) => (
                <Row
                  key={item.circle_id}
                  title={item.circle_name}
                  detail={`Score ${item.score} · ${formatCurrency(Number(item.outstanding_amount), "GHS")} outstanding · ${item.missed_payment_count} missed`}
                  status={item.health}
                />
              ))
            )}
          </RiskSection>
        </>
      )}
    </div>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{metricLabel}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function RiskSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-primary">
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function Row({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 p-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Status value={status} />
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
      {label(value)}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
      <AlertTriangle className="mr-2 inline h-4 w-4" />
      {text}
    </p>
  );
}

function label(value: string) {
  return value.replaceAll("_", " ");
}
