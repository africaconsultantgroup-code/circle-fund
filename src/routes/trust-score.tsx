import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { trustScore, tierLabel, formatGHS } from "@/lib/mock-data";
import { TrustBadge } from "@/components/verification-badge";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/trust-score")({
  component: TrustScorePage,
});

function TrustScorePage() {
  const ts = trustScore;
  const pct = (ts.score / 1000) * 100;
  const circ = 2 * Math.PI * 70;
  const dash = (pct / 100) * circ;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Trust Score" back="/profile" />

      <div className="bg-gradient-card px-5 pt-6 pb-10 text-primary-foreground">
        <div className="flex flex-col items-center">
          <div className="relative h-44 w-44">
            <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
              <circle cx="80" cy="80" r="70" stroke="rgba(255,255,255,0.15)" strokeWidth="10" fill="none" />
              <circle
                cx="80" cy="80" r="70"
                stroke="url(#gold)" strokeWidth="10" fill="none" strokeLinecap="round"
                strokeDasharray={`${dash} ${circ}`}
              />
              <defs>
                <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="oklch(0.82 0.13 88)" />
                  <stop offset="100%" stopColor="oklch(0.88 0.1 95)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">Your score</p>
              <p className="font-display text-5xl font-bold">{ts.score}</p>
              <p className="text-[11px] text-primary-foreground/70">of 1000</p>
            </div>
          </div>
          <div className="mt-3"><TrustBadge tier={ts.tier} /></div>
          <p className="mt-2 text-xs text-primary-foreground/70">{tierLabel(ts.tier)} · Updated today</p>
        </div>
      </div>

      <div className="-mt-6 px-5">
        <div className="grid grid-cols-3 gap-3 rounded-3xl bg-card p-4 shadow-elevated">
          <Mini label="Max circles" value={`${ts.activeCircles}/${ts.maxCircles}`} />
          <Mini label="Max value" value={formatGHS(ts.maxCircleValue)} />
          <Mini label="Payouts" value={ts.factors.completedPayouts} />
        </div>
      </div>

      <section className="px-5 pt-6">
        <h2 className="font-display text-base font-semibold">Score factors</h2>
        <ul className="mt-3 flex flex-col gap-2">
          <Factor icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Verification completed" value={`${ts.factors.verificationCompleted}%`} pos />
          <Factor icon={<TrendingUp className="h-4 w-4 text-success" />} label="Successful circles" value={ts.factors.successfulCircles} pos />
          <Factor icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="On-time payments" value={ts.factors.onTimePayments} pos />
          <Factor icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Completed payouts" value={ts.factors.completedPayouts} pos />
          <Factor icon={<TrendingDown className="h-4 w-4 text-destructive" />} label="Missed payments" value={ts.factors.missedPayments} />
          <Factor icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Disputes" value={ts.factors.disputes} />
        </ul>
      </section>

      <section className="px-5 pt-6 pb-8">
        <h2 className="font-display text-base font-semibold">How to grow your score</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Tip text="Complete all KYC verification steps" />
          <Tip text="Make every contribution on or before the due date" />
          <Tip text="Finish at least 3 full circles without disputes" />
          <Tip text="Keep active circles below your tier limit" />
        </div>
        <Link to="/verify" className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-4 font-display text-sm font-semibold text-primary-foreground shadow-card">
          Complete verification <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="font-display text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Factor({ icon, label, value, pos }: { icon: React.ReactNode; label: string; value: string | number; pos?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">{icon}</span>
        <p className="text-sm">{label}</p>
      </div>
      <span className={`font-display text-sm font-bold ${pos ? "text-success" : "text-destructive"}`}>{value}</span>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm">{text}</p>
    </div>
  );
}