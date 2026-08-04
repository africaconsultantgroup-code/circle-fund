import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Pause, Play, ShieldCheck, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  enablePaymentAutomation,
  loadAutomationDashboard,
  setPaymentAutomationStatus,
  type PaymentAutomation,
} from "@/lib/payment-automation";
import type { AutomationFrequency, AutomationType } from "@/lib/supabase-types";
import { formatCurrency } from "@/lib/diaspora";

type Props = {
  automationType: AutomationType;
  targetId: string;
  targetName: string;
  amount: number;
  frequency: AutomationFrequency;
  nextCollectionDate: string;
  maturityDate?: string | null;
  currency?: "GHS" | "GBP" | "USD" | "EUR";
};

export function PaymentAutomationCard({
  automationType,
  targetId,
  targetName,
  amount: initialAmount,
  frequency: initialFrequency,
  nextCollectionDate: initialDate,
  maturityDate,
  currency = "GHS",
}: Props) {
  const isCircle = automationType === "circle_autopay";
  const [automation, setAutomation] = useState<PaymentAutomation | null>(null);
  const [preference, setPreference] = useState<"manual" | "automatic">("manual");
  const [amount, setAmount] = useState(initialAmount);
  const [frequency, setFrequency] = useState<AutomationFrequency>(initialFrequency);
  const [startDate, setStartDate] = useState(initialDate);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    const result = await loadAutomationDashboard();
    const match = result.data.automations.find((item) =>
      isCircle ? item.circle_id === targetId : item.piggy_id === targetId,
    );
    setAutomation(match ?? null);
    setPreference(match ? "automatic" : "manual");
    if (match) {
      setAmount(Number(match.amount));
      setFrequency(match.frequency);
      setStartDate(match.next_collection_date);
      setPhoneNumber(match.phone_number ?? "");
    }
  };

  useEffect(() => {
    // Initial data hydration from Supabase is the effect's external synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps -- refresh intentionally tracks the selected target only.

  const statusLabel = useMemo(() => {
    if (!automation) return "Off";
    if (
      automation.authorization_status === "pending" &&
      automation.payment_method === "mobile_money"
    ) {
      return `${automation.status} · authorization pending`;
    }
    return automation.status;
  }, [automation]);

  const enable = async () => {
    setIsSaving(true);
    setError("");
    const result = await enablePaymentAutomation({
      automationType,
      circleId: isCircle ? targetId : null,
      piggyId: isCircle ? null : targetId,
      amount,
      frequency,
      paymentMethod: "mobile_money",
      phoneNumber,
      startDate,
    });
    setIsSaving(false);
    setConfirmOpen(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(
      `${isCircle ? "AutoPay" : "AutoSave"} enabled. Provider authorization is still required before automatic deductions can begin.`,
    );
    await refresh();
  };

  const changeStatus = async (action: "pause" | "resume" | "cancel") => {
    if (!automation) return;
    setIsSaving(true);
    setError("");
    const result = await setPaymentAutomationStatus(automation.id, action);
    setIsSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(
      `${isCircle ? "AutoPay" : "AutoSave"} ${action === "pause" ? "paused" : action === "resume" ? "resumed" : "cancelled"}.`,
    );
    await refresh();
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-sm font-semibold">
              {isCircle ? "Circle AutoPay" : "Piggy AutoSave"}
            </h2>
            <p className="text-[11px] text-muted-foreground">{targetName}</p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold capitalize text-muted-foreground">
          {statusLabel}
        </span>
      </div>

      {!automation && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setPreference("automatic")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${preference === "automatic" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {isCircle ? "AutoPay" : "AutoSave On"}
            </button>
            <button
              type="button"
              onClick={() => setPreference("manual")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${preference === "manual" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {isCircle ? "Manual Payment" : "AutoSave Off"}
            </button>
          </div>

          {preference === "automatic" && (
            <div className="mt-4 grid gap-3">
              {!isCircle && (
                <label className="grid gap-1 text-xs font-medium">
                  Save amount
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(event) => setAmount(Number(event.target.value))}
                    className="rounded-xl border border-input bg-background px-3 py-2"
                  />
                </label>
              )}
              {!isCircle && (
                <label className="grid gap-1 text-xs font-medium">
                  Frequency
                  <select
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value as AutomationFrequency)}
                    className="rounded-xl border border-input bg-background px-3 py-2"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every two weeks</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              )}
              <label className="grid gap-1 text-xs font-medium">
                First collection date
                <input
                  type="date"
                  value={startDate}
                  max={maturityDate ?? undefined}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="rounded-xl border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Mobile Money number
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+233..."
                  className="rounded-xl border border-input bg-background px-3 py-2"
                />
              </label>
              <AutomationSummary
                amount={amount}
                frequency={frequency}
                date={startDate}
                currency={currency}
              />
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!phoneNumber || amount <= 0 || !startDate}
                className="rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Enable {isCircle ? "AutoPay" : "AutoSave"}
              </button>
            </div>
          )}
        </>
      )}

      {automation && (
        <div className="mt-4">
          <AutomationSummary
            amount={Number(automation.amount)}
            frequency={automation.frequency}
            date={automation.next_collection_date}
            currency={currency}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {automation.status === "active" && (
              <button
                onClick={() => void changeStatus("pause")}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            )}
            {automation.status === "paused" && (
              <button
                onClick={() => void changeStatus("resume")}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            {["active", "paused"].includes(automation.status) && (
              <button
                onClick={() => void changeStatus("cancel")}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {isSaving && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving automation
        </p>
      )}
      {message && (
        <p className="mt-3 rounded-xl bg-secondary/50 p-3 text-xs text-primary">{message}</p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-destructive/5 p-3 text-xs text-destructive">{error}</p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Authorize {isCircle ? "AutoPay" : "AutoSave"}</AlertDialogTitle>
            <AlertDialogDescription>
              You are scheduling {formatCurrency(amount, currency)} {frequency}. The first
              collection is expected on {formatDate(startDate)}. You can pause or cancel at any
              time. Failed deductions may be retried up to two times. Enabling this does not change
              the underlying {isCircle ? "Circle contribution" : "Piggy Bag"} rules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs text-[color:var(--gold-foreground)]">
            <ShieldCheck className="mb-1 h-4 w-4" />
            Recurring provider authorization is not connected yet. Until it is verified, payments
            become due and require your approval.
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void enable();
              }}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm and Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AutomationSummary({
  amount,
  frequency,
  date,
  currency,
}: {
  amount: number;
  frequency: string;
  date: string;
  currency: "GHS" | "GBP" | "USD" | "EUR";
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/40 p-3 text-xs">
      <Summary label="Amount" value={formatCurrency(amount, currency)} />
      <Summary label="Frequency" value={frequency.replace("_", " ")} />
      <Summary label="Next collection" value={formatDate(date)} />
      <Summary label="Payment source" value="Mobile Money" />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold capitalize">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
