import { useEffect, useState } from "react";
import { CheckCircle2, HandCoins, Loader2, ShieldAlert } from "lucide-react";
import { listDuePayoutsForAdmin, manualTriggerPayout, placePayoutHold, releasePayoutHold, type AdminDuePayout } from "@/lib/db";
import { formatCurrency } from "@/lib/diaspora";

export function PayoutOperationsPage() {
  const [payouts, setPayouts] = useState<AdminDuePayout[]>([]);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPayouts = async () => {
    setIsLoading(true);
    const { data, error } = await listDuePayoutsForAdmin();
    setPayouts(data ?? []);
    setError(error?.message ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    void loadPayouts();
  }, []);

  const handleManualPayout = async (payout: AdminDuePayout) => {
    if (!reason.trim()) {
      setError("Add a reason before triggering a manual payout backup.");
      return;
    }

    const confirmed = window.confirm("Manual payout is a finance backup action. Continue?");
    if (!confirmed) return;

    setBusyId(payout.schedule_id);
    setError("");
    setMessage("");
    const { data, error } = await manualTriggerPayout(payout.schedule_id, reason.trim());
    setBusyId("");

    if (error || !data) {
      setError(error?.message ?? "Manual payout backup could not be recorded.");
      return;
    }

    setMessage("Manual payout backup recorded. Placeholder mode only; no real money moved.");
    setReason("");
    await loadPayouts();
  };

  const handleHold = async (payout: AdminDuePayout) => {
    if (!reason.trim()) {
      setError("Add a reason before placing a payout hold.");
      return;
    }

    setBusyId(payout.schedule_id);
    setError("");
    setMessage("");
    const { error } = await placePayoutHold(payout.schedule_id, reason.trim());
    setBusyId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Payout hold recorded.");
    setReason("");
    await loadPayouts();
  };

  const handleReleaseHold = async (payout: AdminDuePayout) => {
    setBusyId(payout.schedule_id);
    setError("");
    setMessage("");
    const { error } = await releasePayoutHold(payout.schedule_id, reason.trim() || null);
    setBusyId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Payout hold released.");
    setReason("");
    await loadPayouts();
  };

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Finance Operations</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Payouts</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Payouts are controlled by SikaCircle finance operations. Manual payout is only a backup if automatic Hubtel payout fails or the system is down.
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
        <label className="text-xs font-medium text-muted-foreground">Finance note / manual payout reason</label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Required for manual payout or hold actions."
          className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3 text-sm outline-none"
        />
      </div>

      {message && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-success">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}
      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payout schedule
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {payouts.map((payout) => (
            <li key={payout.schedule_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.9fr_1.1fr] lg:items-center">
                <div>
                  <p className="font-display text-sm font-semibold">{payout.circle_name ?? payout.circle_id}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Recipient: {payout.full_name ?? payout.user_id}</p>
                  {payout.hold_reason && <p className="mt-2 text-[11px] text-destructive">Hold: {payout.hold_reason}</p>}
                </div>
                <Metric label="Amount" value={formatCurrency(Number(payout.payout_amount ?? 0), "GHS")} />
                <Metric label="Due" value={formatDate(payout.payout_due_date)} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={busyId === payout.schedule_id}
                    onClick={() => handleManualPayout(payout)}
                    className="flex items-center justify-center gap-1 rounded-xl bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {busyId === payout.schedule_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HandCoins className="h-3.5 w-3.5" />}
                    Manual payout
                  </button>
                  <button
                    type="button"
                    disabled={busyId === payout.schedule_id}
                    onClick={() => handleHold(payout)}
                    className="rounded-xl bg-gold/15 px-3 py-2 text-xs font-semibold text-[color:var(--gold-foreground)] disabled:opacity-60"
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    disabled={busyId === payout.schedule_id}
                    onClick={() => handleReleaseHold(payout)}
                    className="rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success disabled:opacity-60"
                  >
                    Release
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>Status: {payout.status}</span>
                <span>Reference: {payout.payout_reference ?? "none"}</span>
                <span>Automatic attempt: {formatDate(payout.automatic_attempted_at)}</span>
                <span>Manual attempt: {formatDate(payout.manual_attempted_at)}</span>
              </div>
            </li>
          ))}
          {payouts.length === 0 && (
            <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
              No payout schedule records are available yet.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
