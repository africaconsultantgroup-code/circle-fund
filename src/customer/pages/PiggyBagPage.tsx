import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Loader2, LockKeyhole, PiggyBank, Plus, Wallet } from "lucide-react";
import { formatGHS } from "@/lib/mock-data";
import { buildPlanMetrics, formatDate, loadPiggyPlans, type PiggyPlanWithMetrics } from "@/lib/piggy-bag";
import { listPersonalSusuDeposits, type PersonalSusuPlan } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export function PiggyBagPage() {
  const [plans, setPlans] = useState<PiggyPlanWithMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadPlans() {
      setIsLoading(true);
      const user = await getCurrentUser();
      const result = await loadPiggyPlans();

      if (!user) {
        if (!isMounted) return;
        setError(result.error ?? "Please sign in to view Piggy Bag.");
        setPlans([]);
        setIsLoading(false);
        return;
      }

      const metrics = await Promise.all(
        result.data.map(async (plan: PersonalSusuPlan) => {
          const deposits = await listPersonalSusuDeposits(plan.id, user.id);
          return buildPlanMetrics(plan, deposits.data ?? []);
        }),
      );

      if (!isMounted) return;
      setPlans(metrics);
      setError(result.error ?? "");
      setIsLoading(false);
    }

    void loadPlans();

    return () => {
      isMounted = false;
    };
  }, []);

  const lockedBalance = plans.reduce((total, item) => total + item.lockedBalance, 0);
  const availableBalance = plans.reduce((total, item) => total + item.availableBalance, 0);
  const activePlans = plans.filter((item) => item.plan.status === "active").length;

  return (
    <div className="flex flex-col px-5 pt-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
            <PiggyBank className="h-6 w-6" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Piggy Bag</h1>
          <p className="text-xs text-muted-foreground">Personal susu plans with locked savings goals.</p>
        </div>
        <Link to="/piggy-bag/create" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-card">
          <Plus className="h-5 w-5" />
        </Link>
      </div>

      <section className="mt-6 rounded-3xl bg-gradient-card p-5 text-primary-foreground shadow-elevated">
        <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Locked balance</p>
        <p className="mt-1 font-display text-3xl font-bold">{formatGHS(lockedBalance)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <SummaryMetric icon={<Wallet className="h-4 w-4" />} label="Available" value={formatGHS(availableBalance)} />
          <SummaryMetric icon={<LockKeyhole className="h-4 w-4" />} label="Active plans" value={activePlans} />
        </div>
      </section>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
            <Wallet className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold">Hubtel payment preparation</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Deposits are recorded as locked savings now. Hubtel collections and payouts can plug into these records later.</p>
          </div>
        </div>
      </div>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">My plans</h2>
          <Link to="/piggy-bag/create" className="text-xs font-semibold text-primary">Create</Link>
        </div>

        <ul className="mt-3 flex flex-col gap-3">
          {isLoading && (
            <li className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Piggy Bag
            </li>
          )}
          {error && (
            <li className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </li>
          )}
          {!isLoading && !error && plans.length === 0 && (
            <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
              No Piggy Bag plans yet. Create a locked savings goal to get started.
            </li>
          )}
          {plans.map(({ plan, metrics, lockedBalance: locked }) => (
            <li key={plan.id}>
              <Link to="/piggy-bag/$id" params={{ id: plan.id }} className="block rounded-3xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <PiggyBank className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-sm font-semibold">{plan.name}</p>
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">{plan.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatGHS(Number(plan.target_amount))} target - {plan.frequency}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${metrics.progressPercentage}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Locked: <span className="font-semibold text-foreground">{formatGHS(locked)}</span></span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(plan.locked_until)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SummaryMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <div className="flex items-center gap-2 text-primary-foreground/75">
        {icon}
        <p className="text-[10px] uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1 font-display text-base font-semibold">{value}</p>
    </div>
  );
}
