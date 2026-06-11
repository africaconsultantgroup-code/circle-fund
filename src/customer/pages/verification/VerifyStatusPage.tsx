import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, Home, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { VerificationBadge } from "@/components/verification-badge";
import { loadVerificationFlowSummary, type VerificationFlowSummary } from "@/lib/verification-flow";

export function VerifyStatusPage() {
  const [summary, setSummary] = useState<VerificationFlowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    loadVerificationFlowSummary().then((result) => {
      if (!isMounted) return;
      setSummary(result);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Verification status" subtitle="Step 5 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading status
          </div>
        )}

        {summary && (
          <>
            <div className={`rounded-3xl p-5 ${summary.isComplete ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card/70">
                  {summary.isComplete ? <ShieldCheck className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                </span>
                <div className="flex-1">
                  <p className="font-display text-base font-semibold">
                    {summary.isComplete ? "Verification complete" : "Verification in progress"}
                  </p>
                  <p className="text-[11px] opacity-80">
                    {summary.completedCount} of {summary.steps.length} steps accepted
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-card/60">
                <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${summary.percent}%` }} />
              </div>
            </div>

            {summary.error && (
              <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                <p className="text-[11px] font-medium">{summary.error}</p>
              </div>
            )}

            <ul className="flex flex-col gap-3">
              {summary.steps.map((step) => (
                <li key={step.key} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-sm font-semibold">{step.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{step.description}</p>
                    </div>
                    <VerificationBadge status={step.status} />
                  </div>
                </li>
              ))}
            </ul>

            {!summary.isComplete && (
              <Link to={summary.nextStep.to} className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
                Continue: {summary.nextStep.label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {summary.isComplete && (
              <div className="mt-auto flex flex-col gap-3">
                <Link to="/circles" className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
                  Create or join circles <CheckCircle2 className="h-4 w-4" />
                </Link>
                <Link to="/home" className="flex items-center justify-center gap-2 rounded-2xl border border-border py-4 font-display text-base font-semibold text-primary">
                  Back to dashboard <Home className="h-4 w-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
