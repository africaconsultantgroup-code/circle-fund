import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, Home, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { VerificationBadge } from "@/components/verification-badge";
import { faceStepStatus, ghanaCardStepStatus, loadVerificationFlowSummary, type VerificationFlowSummary } from "@/lib/verification-flow";

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
            <div className={`rounded-3xl p-5 ${summary.isFullyVerified ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card/70">
                  {summary.isFullyVerified ? <ShieldCheck className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
                </span>
                <div className="flex-1">
                  <p className="font-display text-base font-semibold">
                    {summary.isFullyVerified ? "Verification approved" : summary.isComplete ? "Verification submitted" : "Verification in progress"}
                  </p>
                  <p className="text-[11px] opacity-80">
                    {summary.isFullyVerified
                      ? "Create and join circles are unlocked."
                      : summary.isComplete
                        ? "Verification forms complete. Waiting for admin approval."
                        : `${summary.completedCount} of ${summary.steps.length} forms completed`}
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

            <VerificationDebug summary={summary} />

            {!summary.isComplete && (
              <Link to={summary.nextStep.to} className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
                Continue: {summary.nextStep.label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {summary.isComplete && !summary.isFullyVerified && (
              <div className="mt-auto flex flex-col gap-3">
                <p className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center text-[11px] font-medium text-[color:var(--gold-foreground)]">
                  Verification forms complete. Waiting for admin approval.
                </p>
                <Link to="/home" className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
                  Back to dashboard <Home className="h-4 w-4" />
                </Link>
              </div>
            )}
            {summary.isFullyVerified && (
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

function VerificationDebug({ summary }: { summary: VerificationFlowSummary }) {
  const verification = summary.verification;

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-[11px] text-muted-foreground">
      <p className="font-semibold text-foreground">Verification debug</p>
      <p className="mt-1">phone_verified: <span className="font-mono text-foreground">{String(Boolean(verification?.phone_verified))}</span></p>
      <p>otp_status: <span className="font-mono text-foreground">{verification?.otp_status ?? "not_started"}</span></p>
      <p>ghana_card_status: <span className="font-mono text-foreground">{ghanaCardStepStatus(verification ?? null)}</span></p>
      <p>selfie_status: <span className="font-mono text-foreground">{faceStepStatus(verification ?? null)}</span></p>
      <p>next_required_step: <span className="font-mono text-foreground">{summary.nextStep.to}</span></p>
    </div>
  );
}
