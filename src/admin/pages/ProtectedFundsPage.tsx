import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, LockKeyhole, Search, Snowflake, Sun } from "lucide-react";
import {
  getAdminProtectedFunds,
  setProtectedFundFreeze,
  type ProtectedFund,
  type ProtectionReconciliationItem,
} from "@/lib/protected-funds";
import { formatCurrency } from "@/lib/diaspora";

export function ProtectedFundsPage() {
  const [funds, setFunds] = useState<ProtectedFund[]>([]);
  const [queue, setQueue] = useState<ProtectionReconciliationItem[]>([]);
  const [report, setReport] = useState<
    Array<{ issue_type: string; record_count: number; total_amount: number }>
  >([]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    const result = await getAdminProtectedFunds();
    setFunds(result.funds);
    setQueue(result.queue);
    setReport(result.report);
    setError(result.error ?? "");
  };

  useEffect(() => {
    // Initial Supabase hydration is this effect's external synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return funds;
    return funds.filter((fund) =>
      [
        fund.id,
        fund.user_id,
        fund.circle_id,
        fund.piggy_id,
        fund.source_payment_transaction_id,
        fund.source_transaction_id,
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(value)),
    );
  }, [funds, query]);

  const changeFreeze = async (fund: ProtectedFund, action: "freeze" | "unfreeze") => {
    if (!reason.trim()) {
      setError("Enter an investigation reason before freezing or unfreezing funds.");
      return;
    }
    setBusyId(fund.id);
    setError("");
    const result = await setProtectedFundFreeze(fund.id, action, reason.trim());
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setReason("");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Protected funds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Investigate purpose-bound Circle and Piggy funds. No release or transfer action is
          available here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Protected" value={sum(funds, ["protected"])} />
        <Metric label="Frozen" value={sum(funds, ["frozen"])} />
        <Metric label="Matured" value={sum(funds, ["matured"])} />
        <Metric label="Release pending" value={sum(funds, ["release_pending"])} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display font-semibold">Freeze control</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Operations, Compliance, or Super Admin authorization is required. A reason is mandatory
          and audited.
        </p>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Fraud review, payment dispute, legal hold, or compliance investigation reason"
          className="mt-3 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
        />
      </section>

      {error && (
        <p className="rounded-2xl bg-destructive/5 p-4 text-sm text-destructive">{error}</p>
      )}

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-semibold">Fund ledger</h2>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search IDs"
              className="w-40 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
          {filtered.map((fund) => (
            <div key={fund.id} className="border-b border-border p-4 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-secondary p-2 text-primary">
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold capitalize">
                      {fund.fund_type} protected fund
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{fund.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(Number(fund.amount), "GHS")}</p>
                  <p className="text-[10px] capitalize text-muted-foreground">
                    {fund.status.replace("_", " ")}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                <span>User: {fund.user_id}</span>
                <span>
                  Source: {fund.source_payment_transaction_id ?? fund.source_transaction_id}
                </span>
                <span>Maturity: {fund.maturity_date ?? "unresolved"}</span>
              </div>
              {fund.freeze_reason && (
                <p className="mt-2 text-xs text-destructive">Freeze reason: {fund.freeze_reason}</p>
              )}
              <div className="mt-3">
                {fund.status === "frozen" ? (
                  <button
                    disabled={busyId === fund.id}
                    onClick={() => void changeFreeze(fund, "unfreeze")}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                  >
                    {busyId === fund.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sun className="h-3.5 w-3.5" />
                    )}{" "}
                    Unfreeze
                  </button>
                ) : ["protected", "matured"].includes(fund.status) ? (
                  <button
                    disabled={busyId === fund.id}
                    onClick={() => void changeFreeze(fund, "freeze")}
                    className="flex items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive"
                  >
                    {busyId === fund.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Snowflake className="h-3.5 w-3.5" />
                    )}{" "}
                    Freeze
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">
              No protected funds match this search.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display font-semibold">Protection reconciliation</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {report.map((item) => (
            <div key={item.issue_type} className="rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-semibold capitalize">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {item.issue_type.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.record_count} record(s) · {formatCurrency(Number(item.total_amount), "GHS")}
              </p>
            </div>
          ))}
          {queue.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gold/30 bg-gold/5 p-4">
              <p className="text-sm font-semibold capitalize">
                {item.issue_type.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Detected {new Date(item.detected_at).toLocaleString()} · {item.status}
              </p>
            </div>
          ))}
          {report.length === 0 && queue.length === 0 && (
            <p className="text-sm text-muted-foreground">No protection mismatches detected.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{formatCurrency(value, "GHS")}</p>
    </div>
  );
}

function sum(funds: ProtectedFund[], statuses: string[]) {
  return funds
    .filter((fund) => statuses.includes(fund.status))
    .reduce((total, fund) => total + Number(fund.amount), 0);
}
