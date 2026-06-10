import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Bell, Plus, TrendingUp, Users, Wallet, ChevronRight, LogIn, ShieldCheck, ShieldAlert } from "lucide-react";
import { currentUser, formatGHS, notifications, verification, verificationProgress, isFullyVerified, trustScore, riskAlerts } from "@/lib/mock-data";
import { TrustBadge } from "@/components/verification-badge";
import { loadUserCircles, type UserCircle } from "@/lib/user-circles";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});

function HomePage() {
  const [circles, setCircles] = useState<UserCircle[]>([]);
  const [circleError, setCircleError] = useState("");
  const totalSaved = 6850;
  const activeCircles = circles.length;
  const totalMembers = circles.reduce((a, c) => a + c.memberCount, 0);
  const unread = notifications.filter((n) => !n.read).length;
  const verified = isFullyVerified(verification);
  const vp = verificationProgress(verification);
  const nextCircle = circles[0];

  useEffect(() => {
    let isMounted = true;

    loadUserCircles().then(({ data, error }) => {
      if (!isMounted) return;
      setCircles(data);
      setCircleError(error ?? "");
    });

    return () => {
      isMounted = false;
    };
  }, []);

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
        {!verified ? (
          <Link to="/verify" className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/30 text-[color:var(--gold-foreground)]">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">Complete verification</p>
              <p className="text-[11px] text-muted-foreground">{vp.done}/{vp.total} steps done - required to create or join circles</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/60">
                <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${vp.percent}%` }} />
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ) : (
          <Link to="/trust-score" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-display text-sm font-semibold">Trust score</p>
                <TrustBadge tier={trustScore.tier} score={trustScore.score} />
              </div>
              <p className="text-[11px] text-muted-foreground">{trustScore.activeCircles}/{trustScore.maxCircles} active - max {formatGHS(trustScore.maxCircleValue)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
        {riskAlerts.length > 0 && (
          <Link to="/risk-alert" className="mt-2 flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="flex-1 text-[11px] font-medium">{riskAlerts.length} risk alerts need attention</p>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 px-5">
        <Link
          to={verified ? "/create-circle" : "/verify"}
          className="flex items-center gap-3 rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-card"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Plus className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-sm font-semibold">Create</p>
            <p className="text-[11px] text-primary-foreground/70">{verified ? "New circle" : "Verify first"}</p>
          </div>
        </Link>
        <Link
          to={verified ? "/join-circle" : "/verify"}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <LogIn className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-sm font-semibold">Join</p>
            <p className="text-[11px] text-muted-foreground">{verified ? "With invite" : "Verify first"}</p>
          </div>
        </Link>
      </div>

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
            <p className="mt-2 font-display text-2xl font-bold">{formatGHS(nextCircle.amount * nextCircle.maxMembers)}</p>
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
              Your circles will appear here after creation.
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
                    {c.memberCount} members - {formatGHS(c.amount)}/{c.frequency}
                  </p>
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

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-primary">{icon}</span>
      <p className="font-display text-lg font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
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
