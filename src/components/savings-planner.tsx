import { useMemo, useState } from "react";
import { CalendarDays, Calculator } from "lucide-react";
import { formatGHS } from "@/lib/mock-data";

type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

const frequencyLabels: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export function SavingsPlanner({
  defaultTargetAmount = 1000,
  defaultDueDate,
  defaultSavedAmount = 0,
}: {
  defaultTargetAmount?: number;
  defaultDueDate?: string;
  defaultSavedAmount?: number;
}) {
  const [targetAmount, setTargetAmount] = useState(defaultTargetAmount);
  const [savedAmount, setSavedAmount] = useState(defaultSavedAmount);
  const [dueDate, setDueDate] = useState(defaultDueDate ?? defaultFutureDate());
  const [frequency, setFrequency] = useState<Frequency>("weekly");

  const plan = useMemo(() => calculateSavingsPlan(targetAmount, savedAmount, dueDate), [targetAmount, savedAmount, dueDate]);
  const selectedAmount = plan.amounts[frequency];

  return (
    <section className="mt-7 px-5">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">Savings planner</h2>
            <p className="text-[11px] text-muted-foreground">Plan your susu contribution only. No deductions are made.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MoneyInput label="Target" value={targetAmount} onChange={setTargetAmount} />
          <MoneyInput label="Saved" value={savedAmount} onChange={setSavedAmount} />
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Due date</label>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-3 py-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {(Object.keys(frequencyLabels) as Frequency[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFrequency(option)}
              className={`rounded-xl border px-2 py-2 text-[11px] font-semibold transition-colors ${
                frequency === option ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {frequencyLabels[option]}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-secondary p-4 text-primary">
          <p className="text-[11px] font-semibold uppercase tracking-wide">Selected plan</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatGHS(selectedAmount)}</p>
          <p className="text-[11px] text-primary/75">Save this {frequencyLabels[frequency].toLowerCase()} until the due date.</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <PlanMetric label="Days remaining" value={String(plan.daysRemaining)} />
          <PlanMetric label="Total remaining" value={formatGHS(plan.remainingAmount)} />
          <PlanMetric label="Daily" value={formatGHS(plan.amounts.daily)} />
          <PlanMetric label="Weekly" value={formatGHS(plan.amounts.weekly)} />
          <PlanMetric label="Biweekly" value={formatGHS(plan.amounts.biweekly)} />
          <PlanMetric label="Monthly" value={formatGHS(plan.amounts.monthly)} />
        </div>
      </div>
    </section>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label} amount</label>
      <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-3 py-3">
        <span className="text-xs font-semibold text-muted-foreground">GHS</span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value)))}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function calculateSavingsPlan(targetAmount: number, savedAmount: number, dueDate: string) {
  const remainingAmount = Math.max(0, targetAmount - savedAmount);
  const daysRemaining = getDaysRemaining(dueDate);

  return {
    remainingAmount,
    daysRemaining,
    amounts: {
      daily: divideByPeriods(remainingAmount, daysRemaining),
      weekly: divideByPeriods(remainingAmount, Math.ceil(daysRemaining / 7)),
      biweekly: divideByPeriods(remainingAmount, Math.ceil(daysRemaining / 14)),
      monthly: divideByPeriods(remainingAmount, Math.ceil(daysRemaining / 30)),
    },
  };
}

function divideByPeriods(amount: number, periods: number) {
  return Math.ceil(amount / Math.max(1, periods));
}

function getDaysRemaining(dueDate: string) {
  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return 0;

  const today = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((due.getTime() - today.getTime()) / msPerDay));
}

function defaultFutureDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}
