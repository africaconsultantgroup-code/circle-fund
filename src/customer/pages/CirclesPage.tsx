import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Search, LogIn, Loader2 } from "lucide-react";
import { loadUserCircles, type UserCircle } from "@/lib/user-circles";
import { getVerificationGateSummary, type VerificationGateSummary } from "@/lib/onboarding";
import { formatCurrency } from "@/lib/diaspora";
import { canCreateCircle, type CreateCircleLimitResult } from "@/lib/circle-limits";

export function CirclesPage() {
  const [circles, setCircles] = useState<UserCircle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [gateSummary, setGateSummary] = useState<VerificationGateSummary | null>(null);
  const [createLimit, setCreateLimit] = useState<CreateCircleLimitResult | null>(null);
  const canUseCircles = Boolean(gateSummary?.canUseCircleActions);
  const formsComplete = Boolean(gateSummary?.formsComplete);
  const canCreate = canUseCircles && Boolean(createLimit?.canCreate);
  const createLimitMessage = createLimit?.message ?? "You can only administer 2 active susu groups at a time.";

  useEffect(() => {
    let isMounted = true;

    Promise.all([loadUserCircles(), getVerificationGateSummary(), canCreateCircle()]).then(([circleResult, gateResult, createResult]) => {
      if (!isMounted) return;
      setCircles(circleResult.data);
      setError(circleResult.error ?? "");
      setGateSummary(gateResult);
      setCreateLimit(createResult);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col px-5 pt-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">My Circles</h1>
          <p className="text-xs text-muted-foreground">{circles.length} active circles</p>
        </div>
        {canCreate ? (
          <Link to="/create-circle" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-card">
            <Plus className="h-5 w-5" />
          </Link>
        ) : (
          <button disabled className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-card">
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input placeholder="Search circles" className="flex-1 bg-transparent text-sm outline-none" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {canUseCircles ? (
          <>
            {canCreate ? <Link to="/create-circle" className="flex flex-col items-start gap-2 rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-card">
              <Plus className="h-5 w-5" />
              <p className="font-display text-sm font-semibold">Create circle</p>
              <p className="text-[11px] text-primary-foreground/70">Invite up to 15 members</p>
            </Link> : <DisabledCircleAction icon={<Plus className="h-5 w-5" />} title="Create circle" reason={createLimitMessage} />}
            <Link to="/join-circle" className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 shadow-card">
              <LogIn className="h-5 w-5 text-primary" />
              <p className="font-display text-sm font-semibold">Join circle</p>
              <p className="text-[11px] text-muted-foreground">Use invite code or link</p>
            </Link>
          </>
        ) : (
          <>
            <DisabledCircleAction icon={<Plus className="h-5 w-5" />} title="Create circle" />
            <DisabledCircleAction icon={<LogIn className="h-5 w-5" />} title="Join circle" />
          </>
        )}
      </div>
      {!canUseCircles && gateSummary?.message && (
        <Link to={formsComplete ? "/verify/status" : gateSummary.nextStep.to} className="mt-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[11px] font-medium text-[color:var(--gold-foreground)]">
          {formsComplete ? "Verification submitted. Your account is under review." : `Continue verification: ${gateSummary.nextStep.label}`}
        </Link>
      )}
      {canUseCircles && !canCreate && (
        <div className="mt-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[11px] font-medium text-[color:var(--gold-foreground)]">
          {createLimitMessage}
        </div>
      )}

      <ul className="mt-7 flex flex-col gap-3">
        {isLoading && (
          <li className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading circles
          </li>
        )}
        {error && (
          <li className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </li>
        )}
        {!isLoading && !error && circles.length === 0 && (
          <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            <p>No circles yet. Create your first circle or join one with an invite link.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {canCreate ? <Link to="/create-circle" className="rounded-xl bg-gradient-primary px-3 py-2 text-center text-[11px] font-semibold text-primary-foreground">
                Create Circle
              </Link> : <button disabled className="rounded-xl bg-muted px-3 py-2 text-center text-[11px] font-semibold text-muted-foreground">
                Create Locked
              </button>}
              <Link to="/join-circle" className="rounded-xl border border-border px-3 py-2 text-center text-[11px] font-semibold text-primary">
                Join Circle
              </Link>
            </div>
          </li>
        )}
        {circles.map((c) => (
          <li key={c.id}>
            <Link to="/circles/$id" params={{ id: c.id }} className="block rounded-3xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground font-display font-semibold">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-semibold">{c.name}</p>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{c.category}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{c.memberCount}/{c.maxMembers} members - {formatCurrency(c.amount, c.baseCurrency)}/{c.frequency}</p>
                  {c.pendingMemberCount > 0 && (
                    <p className="text-[10px] font-semibold text-[color:var(--gold-foreground)]">{c.pendingMemberCount} pending request{c.pendingMemberCount === 1 ? "" : "s"}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${(c.currentCycle / c.totalCycles) * 100}%` }} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{c.currentCycle}/{c.totalCycles}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Next: <span className="font-semibold text-foreground">{c.nextRecipient}</span></span>
                <span className="text-muted-foreground">{c.nextPayoutDate}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DisabledCircleAction({ icon, title, reason = "Verification required" }: { icon: React.ReactNode; title: string; reason?: string }) {
  return (
    <button disabled className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left opacity-50 shadow-card">
      <span className="text-primary">{icon}</span>
      <p className="font-display text-sm font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground">{reason}</p>
    </button>
  );
}
