import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  LogIn,
  PiggyBank,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import {
  emptyDashboard,
  loadFinancialDashboard,
  type DashboardData,
  SectionHeader,
} from "@/customer/pages/HomePage";
import { formatCurrency } from "@/lib/diaspora";
import { getVerificationGateSummary, type VerificationGateSummary } from "@/lib/onboarding";
import { canCreateCircle, type CreateCircleLimitResult } from "@/lib/circle-limits";
import type { CurrencyCode } from "@/lib/supabase-types";

export function SimplifiedHomePage() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [gateSummary, setGateSummary] = useState<VerificationGateSummary | null>(null);
  const [createLimit, setCreateLimit] = useState<CreateCircleLimitResult | null>(null);

  const loadDashboard = useCallback(async () => {
    const [data, gate, limit] = await Promise.all([
      loadFinancialDashboard(),
      getVerificationGateSummary(),
      canCreateCircle(),
    ]);
    setDashboard(data);
    setGateSummary(gate);
    setCreateLimit(limit);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    const refresh = () => {
      if (document.visibilityState === "visible") void loadDashboard();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadDashboard]);

  const nextContribution = dashboard.upcomingContributions[0] ?? null;
  const primaryCurrency = (nextContribution?.circles?.base_currency ??
    dashboard.circles[0]?.baseCurrency ??
    "GHS") as CurrencyCode;
  const greetingName =
    dashboard.profile?.full_name?.split(" ")[0] ||
    dashboard.profile?.email?.split("@")[0] ||
    "there";
  const canUseCircles = Boolean(gateSummary?.canUseCircleActions);

  return (
    <div className="flex flex-col pb-8">
      <header className="bg-gradient-card px-5 pb-20 pt-12 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-foreground/70">Welcome back,</p>
            <h1 className="font-display text-2xl font-bold tracking-tight">{greetingName}</h1>
          </div>
          <Link
            to="/notifications"
            className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"
          >
            <Bell className="h-5 w-5" />
            {dashboard.notifications.length > 0 && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-gold" />
            )}
          </Link>
        </div>

        <div className="mt-7">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/60">
            Available balance
          </p>
          <p className="mt-1 font-display text-4xl font-bold tracking-tight">
            {formatCurrency(dashboard.availableWalletBalance, primaryCurrency)}
          </p>
          <p className="mt-2 text-xs text-primary-foreground/70">
            Protected in SikaCircle: {formatCurrency(dashboard.lockedBalance, primaryCurrency)}
          </p>
        </div>
      </header>

      <section className="-mt-12 px-5">
        {dashboard.error && (
          <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {dashboard.error}
          </div>
        )}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-elevated">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            Next action
          </p>
          {!gateSummary?.isEligible ? (
            <>
              <p className="mt-2 font-display text-lg font-semibold">Complete your verification</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Finish verification before using Circle money features.
              </p>
              <Link
                to={
                  gateSummary?.formsComplete
                    ? "/verify/status"
                    : (gateSummary?.nextStep.to ?? "/verify")
                }
                className="mt-4 flex w-full items-center justify-center rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                {gateSummary?.formsComplete ? "View status" : "Continue verification"}
              </Link>
            </>
          ) : nextContribution ? (
            <>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {nextContribution.circles?.name ?? "Circle contribution"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Due {formatDate(nextContribution.due_date)}
                  </p>
                </div>
                <p className="font-display text-lg font-semibold">
                  {formatCurrency(
                    Number(nextContribution.amount_due ?? nextContribution.amount ?? 0),
                    nextContribution.circles?.base_currency ?? primaryCurrency,
                  )}
                </p>
              </div>
              <Link
                to="/payments"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                <Wallet className="h-4 w-4" />
                Pay now
              </Link>
            </>
          ) : dashboard.nextPayout ? (
            <>
              <p className="mt-2 font-display text-lg font-semibold">Upcoming payout</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dashboard.nextPayout.circle_name ?? "Your Circle"} ·{" "}
                {formatDate(dashboard.nextPayout.payout_due_date)}
              </p>
              <p className="mt-3 font-display text-2xl font-bold">
                {formatCurrency(Number(dashboard.nextPayout.payout_amount), primaryCurrency)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-lg font-semibold">You’re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No contribution payment needs your attention right now.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="Quick actions" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          <QuickAction to="/payments" icon={<Wallet className="h-5 w-5" />} label="Pay" />
          <QuickAction to="/piggy-bag" icon={<PiggyBank className="h-5 w-5" />} label="Save" />
          <QuickAction
            to="/create-circle"
            icon={<Plus className="h-5 w-5" />}
            label="Create"
            disabled={!canUseCircles || createLimit?.canCreate === false}
          />
          <QuickAction
            to="/join-circle"
            icon={<LogIn className="h-5 w-5" />}
            label="Join"
            disabled={!canUseCircles}
          />
        </div>
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="My Circles" actionTo="/circles" actionLabel="View all" />
        {dashboard.circles.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {dashboard.circles.slice(0, 2).map((circle) => {
              const financial = dashboard.circleFinancials[circle.id];
              const progress = financial?.contributionProgress ?? 0;
              return (
                <li key={circle.id}>
                  <Link
                    to="/circles/$id"
                    params={{ id: circle.id }}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary font-display text-sm font-semibold text-primary-foreground">
                      {circle.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-sm font-semibold">{circle.name}</p>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold uppercase text-primary">
                          {circle.circleType === "goal" ? "Goal" : "Rotational"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Contribution progress {progress}%
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-primary"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Users className="h-4 w-4" />} text="You have no active Circles yet." />
        )}
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="Upcoming" actionTo="/payments" actionLabel="View schedule" />
        {dashboard.upcomingContributions.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {dashboard.upcomingContributions.slice(0, 2).map((contribution) => (
              <li
                key={contribution.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {contribution.circles?.name ?? "Circle contribution"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Due {formatDate(contribution.due_date)}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(
                    Number(contribution.amount_due ?? contribution.amount ?? 0),
                    contribution.circles?.base_currency ?? primaryCurrency,
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CircleDollarSign className="h-4 w-4" />}
            text="No contribution payments are due right now."
          />
        )}
      </section>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  label,
  disabled = false,
}: {
  to: "/payments" | "/piggy-bag" | "/create-circle" | "/join-circle";
  icon: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/40 px-2 py-3 text-muted-foreground opacity-50">
        {icon}
        <span className="text-[10px] font-semibold">{label}</span>
      </div>
    );
  }
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-3 text-primary shadow-card"
    >
      {icon}
      <span className="text-[10px] font-semibold text-foreground">{label}</span>
    </Link>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">{icon}</span>
      <p>{text}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
