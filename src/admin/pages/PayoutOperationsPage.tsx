import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import {
  loadFundReleases,
  loadPayoutExecutionMode,
  loadPayoutPreview,
  loadPayoutReconciliation,
  type FundRelease,
  type PayoutPreview,
} from "@/lib/payout-releases";
import { formatCurrency } from "@/lib/diaspora";

export function PayoutOperationsPage() {
  const [previews, setPreviews] = useState<PayoutPreview[]>([]);
  const [releases, setReleases] = useState<FundRelease[]>([]);
  const [issues, setIssues] = useState<
    Array<{ issue_type: string; record_count: number; total_amount: number }>
  >([]);
  const [mode, setMode] = useState("preview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      loadPayoutPreview(),
      loadFundReleases(),
      loadPayoutReconciliation(),
      loadPayoutExecutionMode(),
    ]).then(([preview, release, reconciliation, settings]) => {
      setPreviews(preview.data ?? []);
      setReleases(release.data ?? []);
      setIssues(reconciliation.data ?? []);
      setMode(settings.data?.execution_mode ?? "preview");
      setError(
        preview.error?.message ??
          release.error?.message ??
          reconciliation.error?.message ??
          settings.error?.message ??
          "",
      );
      setLoading(false);
    });
  }, []);

  const counts = useMemo(
    () => ({
      ready: previews.filter((item) => item.eligibility === "READY").length,
      blocked: previews.filter((item) => item.eligibility !== "READY").length,
      pending: releases.filter((item) => item.status === "release_pending").length,
      processing: releases.filter((item) => item.status === "provider_processing").length,
      failed: releases.filter((item) =>
        ["provider_failed", "retry_pending", "provider_status_unknown"].includes(item.status),
      ).length,
      released: releases.filter((item) => item.status === "released").length,
    }),
    [previews, releases],
  );

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Finance Operations
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Payout releases</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Server-calculated payout eligibility backed by protected-fund allocations.
            </p>
          </div>
          <span className="rounded-full bg-gold/15 px-3 py-1.5 text-xs font-semibold uppercase text-[color:var(--gold-foreground)]">
            {mode} mode · no live payout
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(counts).map(([label, value]) => (
          <Metric key={label} label={label} value={String(value)} />
        ))}
      </div>

      {error && <Notice icon={AlertTriangle} text={error} danger />}
      {loading && <Notice icon={Loader2} text="Loading authoritative payout preview…" spin />}

      {!loading && (
        <>
          <h2 className="mt-7 font-display text-lg font-semibold">Authoritative preview</h2>
          <ul className="mt-3 space-y-3">
            {previews.map((item) => (
              <li
                key={item.candidate_key}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.7fr_0.8fr_1.2fr] lg:items-center">
                  <div>
                    <p className="font-display text-sm font-semibold">
                      {item.release_type === "circle_payout" ? "Circle payout" : "Piggy maturity"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Beneficiary {shortId(item.beneficiary_user_id)} ·{" "}
                      {formatDate(item.maturity_date)}
                    </p>
                  </div>
                  <Metric
                    label="Expected"
                    value={formatCurrency(Number(item.amount), item.currency)}
                  />
                  <Metric
                    label="Protected"
                    value={formatCurrency(Number(item.protected_funds_available), item.currency)}
                  />
                  <div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.eligibility === "READY" ? "bg-success/15 text-success" : "bg-gold/15 text-[color:var(--gold-foreground)]"}`}
                    >
                      {item.eligibility}
                    </span>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {item.blocking_reason ?? "Eligible for controlled release preparation."}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Destination: {item.payment_destination_summary ?? "not verified"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {previews.length === 0 && (
              <li className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                No protected payout candidates.
              </li>
            )}
          </ul>

          <h2 className="mt-7 font-display text-lg font-semibold">Release records</h2>
          <ul className="mt-3 space-y-3">
            {releases.map((release) => (
              <li key={release.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{release.release_reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {release.release_type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatCurrency(Number(release.amount), release.currency)}
                  </p>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase">
                    {release.status}
                  </span>
                </div>
              </li>
            ))}
            {releases.length === 0 && (
              <li className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                No release has been created. Preview mode remains active.
              </li>
            )}
          </ul>

          {issues.length > 0 && (
            <div className="mt-7 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="font-display text-sm font-semibold">Payout reconciliation</p>
              {issues.map((issue) => (
                <p key={issue.issue_type} className="mt-2 text-xs text-muted-foreground">
                  {issue.issue_type.replaceAll("_", " ")}: {issue.record_count}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function Notice({
  icon: Icon,
  text,
  danger = false,
  spin = false,
}: {
  icon: typeof ShieldCheck;
  text: string;
  danger?: boolean;
  spin?: boolean;
}) {
  return (
    <div
      className={`mt-5 flex items-center gap-2 rounded-2xl border p-4 text-sm ${danger ? "border-destructive/30 text-destructive" : "border-border text-muted-foreground"}`}
    >
      <Icon className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} />
      {text}
    </div>
  );
}

function shortId(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
function formatDate(value: string | null) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "No maturity date";
}
