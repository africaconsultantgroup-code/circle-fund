import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Bell, Plus, TrendingUp, Users, Wallet, ChevronRight, LogIn, ShieldCheck, ShieldAlert, PiggyBank, LockKeyhole } from "lucide-react";
import { currentUser, formatGHS, notifications } from "@/lib/mock-data";
import { SavingsPlanner } from "@/components/savings-planner";
import { loadUserCircles, type UserCircle } from "@/lib/user-circles";
import { getVerificationGateSummary, type VerificationGateSummary } from "@/lib/onboarding";
import { formatCurrency } from "@/lib/diaspora";

export function HomePage() {
  const [circles, setCircles] = useState<UserCircle[]>([]);
  const [circleError, setCircleError] = useState("");
  const [gateSummary, setGateSummary] = useState<VerificationGateSummary | null>(null);
  const totalSaved = 6850;
  const activeCircles = circles.length;
  const totalMembers = circles.reduce((a, c) => a + c.memberCount, 0);
  const unread = notifications.filter((n) => !n.read).length;
  const nextCircle = circles[0];
  const canUseCircles = Boolean(gateSummary?.canUseCircleActions);

  const loadDashboard = useCallback(async () => {
    const [circleResult, gateResult] = await Promise.all([loadUserCircles(), getVerificationGateSummary()]);
    setCircles(circleResult.data);
    setCircleError(circleResult.error ?? "");
    setGateSummary(gateResult);
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadDashboard().then(() => {
      if (!isMounted) return;
    });

    const refresh = () => {
      if (document.visibilityState === "visible") void loadDashboard();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadDashboard]);

  return (
    <div className="flex flex-col">
      <header className="bg-gradient-card px-5 pt-12 pb-24 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={currentUser.avatar} alt="" className="h-11 w-11 rounded-full border-2 border-white/20 bg-white" />
            <div>
              <p className="text-xs text-primary-foreground/70">Good morning,</p>
              <p className="font-display text-base font-semibold">{currentUser.name.split(" ")[0]}</p>
            </div>
          </div>
          <Link to="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-gold" />}
          </Link>
        </div>

        <div className="mt-8">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/60">Total Saved</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-tight">{formatGHS(totalSaved)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-gold">
            <TrendingUp className="h-3 w-3" /> +12.4% this month
          </p>
        </div>
      </header>

      <div className="-mt-16 px-5">
        <div className="grid grid-cols-3 gap-3 rounded-3xl bg-card p-4 shadow-elevated">
          <Stat label="Circles" value={activeCircles} icon={<Users className="h-4 w-4" />} />
          <Stat label="Members" value={totalMembers} icon={<Wallet className="h-4 w-4" />} />
          <Stat label="Cycles" value={nextCircle?.totalCycles ?? 0} icon={<ArrowUpRight className="h-4 w-4" />} />
        </div>
      </div>

      <div className="mt-5 px-5">
        <VerificationStatusCard gateSummary={gateSummary} />
        <Link to="/risk-alert" className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-muted-foreground shadow-card">
            <ShieldAlert className="h-4 w-4" />
            <p className="flex-1 text-[11px] font-medium">No active risk alerts</p>
            <ChevronRight className="h-4 w-4" />
          </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 px-5">
        {canUseCircles ? (
          <>
            <Link to="/create-circle" className="flex items-center gap-3 rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold">Create</p>
                <p className="text-[11px] text-primary-foreground/70">New circle</p>
              </div>
            </Link>
            <Link to="/join-circle" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <LogIn className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold">Join</p>
                <p className="text-[11px] text-muted-foreground">With invite</p>
              </div>
            </Link>
          </>
        ) : (
          <>
            <DisabledAction icon={<Plus className="h-5 w-5" />} title="Create" />
            <DisabledAction icon={<LogIn className="h-5 w-5" />} title="Join" />
          </>
        )}
      </div>

      <SavingsPlanner
        defaultTargetAmount={nextCircle?.amount ?? 1000}
        defaultDueDate={toDateInputValue(nextCircle?.nextPayoutDate)}
        currency={nextCircle?.baseCurrency ?? "GHS"}
      />

      <section className="mt-7 px-5">
        <SectionHeader title="Personal Susu" actionTo="/piggy-bag" actionLabel="Open" />
        <Link to="/piggy-bag" className="mt-3 flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
            <PiggyBank className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold">Piggy Bag</p>
            <p className="text-[11px] text-muted-foreground">Create a locked savings goal and track progress.</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <LockKeyhole className="h-4 w-4" />
          </span>
        </Link>
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="Up next" actionTo="/payments" actionLabel="See all" />
        {nextCircle ? (
          <div className="mt-3 rounded-3xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Next payout</p>
              <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--gold-foreground)]">
                {nextCircle.frequency}
              </span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{formatCurrency(nextCircle.amount * nextCircle.maxMembers, nextCircle.baseCurrency)}</p>
            <p className="text-xs text-muted-foreground">
              To {nextCircle.nextRecipient} - {nextCircle.nextPayoutDate}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-primary"
                style={{ width: `${(nextCircle.currentCycle / nextCircle.totalCycles) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Cycle {nextCircle.currentCycle} of {nextCircle.totalCycles}
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            {circleError || "Create a circle to see your next payout."}
          </div>
        )}
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="My Circles" actionTo="/circles" actionLabel="View all" />
        <ul className="mt-3 flex flex-col gap-3">
          {circleError && (
            <li className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {circleError}
            </li>
          )}
            {!circleError && circles.length === 0 && (
            <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
              <p>Your circles will appear here after creation or joining.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link to="/create-circle" className="rounded-xl bg-gradient-primary px-3 py-2 text-center text-[11px] font-semibold text-primary-foreground">
                  Create Circle
                </Link>
                <Link to="/join-circle" className="rounded-xl border border-border px-3 py-2 text-center text-[11px] font-semibold text-primary">
                  Join Circle
                </Link>
              </div>
            </li>
          )}
          {circles.slice(0, 2).map((c) => (
            <li key={c.id}>
              <Link
                to="/circle/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground font-display text-base font-semibold">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-display text-sm font-semibold">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.memberCount} members - {formatCurrency(c.amount, c.baseCurrency)}/{c.frequency}
                  </p>
                  {c.pendingMemberCount > 0 && (
                    <p className="text-[10px] font-semibold text-[color:var(--gold-foreground)]">{c.pendingMemberCount} pending request{c.pendingMemberCount === 1 ? "" : "s"}</p>
                  )}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${(c.currentCycle / c.totalCycles) * 100}%` }} />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function VerificationStatusCard({ gateSummary }: { gateSummary: VerificationGateSummary | null }) {
  const statuses = gateSummary?.statuses;
  const complete = Boolean(gateSummary?.isEligible);
  const formsComplete = Boolean(gateSummary?.formsComplete);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${complete ? "bg-success/10 text-success" : "bg-gold/20 text-[color:var(--gold-foreground)]"}`}>
          {complete ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display text-sm font-semibold">Verification status</p>
          </div>
          {complete && <p className="text-[11px] text-muted-foreground">Verification complete. Create and join circles are unlocked.</p>}
          {!complete && formsComplete && <p className="text-[11px] text-muted-foreground">Verification forms complete. Circle actions are available while review is pending.</p>}
          {!complete && !formsComplete && <p className="text-[11px] text-muted-foreground">Circle actions are available for testing. Verification may be required before contributions start.</p>}
        </div>
        <Link to={complete || formsComplete ? "/verify/status" : gateSummary?.nextStep.to ?? "/verify"} className="text-xs font-semibold text-primary">
          {complete ? "Status" : formsComplete ? "Review" : "Continue"}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatusLine label="Phone OTP" value={statusLabel(statuses?.phone)} good={statuses?.phone === "verified"} />
        <StatusLine label="Ghana Card" value={statusLabel(statuses?.ghanaCard)} good={statusAccepted(statuses?.ghanaCard)} />
        <StatusLine label="Face" value={statusLabel(statuses?.face)} good={statusAccepted(statuses?.face)} />
        <StatusLine label="Profile" value={statuses?.profile === "complete" ? "Complete" : "Incomplete"} good={statuses?.profile === "complete"} />
        <StatusLine label="Account" value={statuses?.account === "active" ? "Active" : "Inactive"} good={statuses?.account === "active"} />
      </div>
    </div>
  );
}

function StatusLine({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold ${good ? "text-success" : "text-muted-foreground"}`}>{value}</p>
    </div>
  );
}

function statusLabel(status: string | undefined) {
  if (status === "verified") return "Verified";
  if (status === "manual_review") return "Pending review";
  if (status === "pending") return "Pending review";
  if (status === "failed") return "Failed";
  return "Not started";
}

function statusAccepted(status: string | undefined) {
  return status === "verified" || status === "manual_review" || status === "pending";
}

function DisabledAction({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <button disabled className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left opacity-50 shadow-card">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span>
      <div>
        <p className="font-display text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground">Verify first</p>
      </div>
    </button>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-primary">{icon}</span>
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function toDateInputValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function SectionHeader({ title, actionTo, actionLabel }: { title: string; actionTo?: string; actionLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {actionTo && actionLabel && (
        <Link to={actionTo} className="text-xs font-medium text-primary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
