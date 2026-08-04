import { useEffect, useState } from "react";
import { Target, ShieldCheck, UserRound } from "lucide-react";
import { getGoalSusuCycles, getGoalSusuProgress } from "@/lib/db";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

type GoalProgress = Awaited<ReturnType<typeof getGoalSusuProgress>>["data"] extends
  | (infer T)[]
  | null
  ? T
  : never;
type GoalCycle = Awaited<ReturnType<typeof getGoalSusuCycles>>["data"] extends (infer T)[] | null
  ? T
  : never;

export function GoalSusuDashboard({
  circleId,
  currency,
}: {
  circleId: string;
  currency: CurrencyCode;
}) {
  const [goal, setGoal] = useState<GoalProgress | null>(null);
  const [cycles, setCycles] = useState<GoalCycle[]>([]);

  useEffect(() => {
    void Promise.all([getGoalSusuProgress(circleId), getGoalSusuCycles(circleId)]).then(
      ([progressResult, cycleResult]) => {
        setGoal(progressResult.data?.[0] ?? null);
        setCycles(cycleResult.data ?? []);
      },
    );
  }, [circleId]);

  if (!goal) return null;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Target className="h-5 w-5" />
          <h2 className="font-display text-lg font-semibold">Goal Susu progress</h2>
        </div>
        <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold uppercase text-primary">
          Goal
        </span>
      </div>
      <p className="mt-4 font-display text-2xl font-bold">
        {formatCurrency(Number(goal.collected_amount), currency)} /{" "}
        {formatCurrency(Number(goal.target_amount), currency)}
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-gold"
          style={{ width: `${Math.min(Number(goal.progress_percent), 100)}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-primary">
        {Number(goal.progress_percent)}%
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Protected" value={formatCurrency(Number(goal.protected_amount), currency)} />
        <Metric label="Pending" value={formatCurrency(Number(goal.pending_amount), currency)} />
        <Metric
          label="Outstanding"
          value={formatCurrency(Number(goal.outstanding_amount), currency)}
        />
        <Metric label="Days remaining" value={String(goal.days_remaining)} />
        <Metric label="Members paid" value={String(goal.members_paid)} />
        <Metric label="Outstanding members" value={String(goal.members_outstanding)} />
      </div>
      <div className="mt-4 rounded-2xl bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-primary">
          <UserRound className="h-4 w-4" />
          <p className="text-xs font-semibold">Beneficiary</p>
        </div>
        <p className="mt-2 text-sm font-semibold">{goal.beneficiary_name}</p>
        <p className="text-xs text-muted-foreground">{goal.masked_destination}</p>
        <p className="mt-1 text-[10px] uppercase text-muted-foreground">
          {goal.verification_status.replaceAll("_", " ")}
        </p>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-secondary p-3 text-primary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-xs font-semibold">Protected in SikaCircle</p>
          <p className="text-[11px] text-muted-foreground">
            Payout status: {goal.payout_status}. Maturity:{" "}
            {new Date(goal.maturity_date).toLocaleDateString()}.
          </p>
        </div>
      </div>
      {cycles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Payout cycles</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {cycles.map((cycle) => (
              <li key={cycle.cycle_id} className="rounded-2xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold">Cycle {cycle.cycle_number}</p>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold uppercase text-primary">
                    {cycle.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Payout {new Date(cycle.payout_date).toLocaleDateString()}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Metric
                    label="Expected"
                    value={formatCurrency(Number(cycle.expected_amount), currency)}
                  />
                  <Metric
                    label="Confirmed"
                    value={formatCurrency(Number(cycle.confirmed_amount), currency)}
                  />
                  <Metric
                    label="Protected"
                    value={formatCurrency(Number(cycle.protected_amount), currency)}
                  />
                  <Metric
                    label="Outstanding"
                    value={formatCurrency(Number(cycle.outstanding_amount), currency)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
