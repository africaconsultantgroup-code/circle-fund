import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Loader2, LockKeyhole, PiggyBank, Repeat, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatGHS } from "@/lib/mock-data";
import { calculatePiggyPlan, createPiggyPlan, deriveEndDate, formatDate, toDateInputValue, type PiggyDurationUnit, type PiggyFrequency } from "@/lib/piggy-bag";

const today = toDateInputValue(new Date());

export function CreatePiggyBagPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("Emergency fund");
  const [targetAmount, setTargetAmount] = useState(1000);
  const [frequency, setFrequency] = useState<PiggyFrequency>("weekly");
  const [duration, setDuration] = useState(12);
  const [durationUnit, setDurationUnit] = useState<PiggyDurationUnit>("weeks");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(deriveEndDate(today, 12, "weeks"));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const calculation = useMemo(
    () => calculatePiggyPlan({ targetAmount, frequency, startDate, endDate, currentSaved: 0 }),
    [targetAmount, frequency, startDate, endDate],
  );

  const updateDuration = (nextDuration: number, nextUnit = durationUnit, nextStartDate = startDate) => {
    const safeDuration = Math.max(Math.round(Number(nextDuration) || 1), 1);
    setDuration(safeDuration);
    setEndDate(deriveEndDate(nextStartDate, safeDuration, nextUnit));
  };

  const updateDurationUnit = (nextUnit: PiggyDurationUnit) => {
    setDurationUnit(nextUnit);
    setEndDate(deriveEndDate(startDate, duration, nextUnit));
  };

  const updateStartDate = (nextStartDate: string) => {
    setStartDate(nextStartDate);
    setEndDate(deriveEndDate(nextStartDate, duration, durationUnit));
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Enter a savings goal name.");
      return;
    }

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }

    if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) {
      setError("Choose a valid target end date.");
      return;
    }

    setIsSaving(true);
    const result = await createPiggyPlan({
      name,
      targetAmount,
      frequency,
      duration,
      durationUnit,
      startDate,
      endDate,
    });
    setIsSaving(false);

    if (result.error || !result.data) {
      setError(result.error ?? "We could not create this Piggy Bag plan. Please try again.");
      return;
    }

    setSuccess("Piggy Bag plan created. Savings added to this plan will stay locked until the target date.");
    const planId = result.data.id;
    setTimeout(() => {
      void navigate({ to: "/piggy-bag/$id", params: { id: planId } });
    }, 700);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="New Piggy Bag" subtitle="Create a locked savings plan" back="/piggy-bag" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        <section className="rounded-3xl bg-gradient-card p-5 text-primary-foreground shadow-elevated">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <PiggyBank className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Target amount</p>
              <p className="font-display text-2xl font-bold">{formatGHS(targetAmount || 0)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Per payment" value={formatGHS(calculation.expectedContributionPerPeriod)} />
            <Metric label="Payments" value={calculation.numberOfPayments} />
          </div>
        </section>

        <Section icon={<PiggyBank className="h-4 w-4" />} title="Goal">
          <Input label="Savings goal name" value={name} onChange={setName} placeholder="e.g. Rent top-up" />
          <NumberInput label="Amount to save (GHS)" value={targetAmount} onChange={setTargetAmount} />
        </Section>

        <Section icon={<Repeat className="h-4 w-4" />} title="Plan rhythm">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Saving frequency</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["daily", "weekly", "biweekly", "monthly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFrequency(option)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-medium capitalize transition-colors ${
                    frequency === option ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border bg-card text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <NumberInput label="Duration" value={duration} onChange={(value) => updateDuration(value)} />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Unit</label>
              <select value={durationUnit} onChange={(event) => updateDurationUnit(event.target.value as PiggyDurationUnit)} className="mt-1.5 w-full appearance-none rounded-2xl border border-input bg-muted/40 px-3 py-3.5 text-sm outline-none">
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>
        </Section>

        <Section icon={<Calendar className="h-4 w-4" />} title="Dates">
          <Input label="Start date" type="date" value={startDate} onChange={updateStartDate} />
          <Input label="Target end date" type="date" value={endDate} onChange={setEndDate} />
          <div className="rounded-2xl bg-muted/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Locked until</p>
            <p className="mt-1 font-display text-sm font-semibold">{formatDate(endDate)}</p>
          </div>
        </Section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <LockKeyhole className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">Savings preview</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatGHS(calculation.expectedContributionPerPeriod)} {frequency} for {calculation.numberOfPayments} payments. Withdrawal unlocks on {formatDate(endDate)}.
              </p>
            </div>
          </div>
        </section>

        {success && (
          <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-[11px] font-medium">{success}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSubmit}
          className="rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50"
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Creating
            </span>
          ) : "Create Piggy Bag"}
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary">{icon}</span>
        <p className="font-display text-sm font-semibold">{title}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wide text-primary-foreground/70">{label}</p>
      <p className="mt-1 font-display text-base font-semibold">{value}</p>
    </div>
  );
}

function Input({ label, type = "text", placeholder, value, onChange }: { label: string; type?: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none"
      />
    </div>
  );
}
