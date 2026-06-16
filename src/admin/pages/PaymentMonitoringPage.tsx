import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { findHubtelPayment, getAdminOverview, reconcileHubtelPayment, type AdminPaymentTransaction } from "@/admin/api";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

type PaymentMonitoringPageProps = {
  title: string;
  description: string;
  emptyText: string;
};

export function PaymentMonitoringPage({ title, description, emptyText }: PaymentMonitoringPageProps) {
  const [transactions, setTransactions] = useState<AdminPaymentTransaction[]>([]);
  const [staffRole, setStaffRole] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reconcilingReference, setReconcilingReference] = useState<string | null>(null);
  const [searchReference, setSearchReference] = useState("");
  const [searchedTransaction, setSearchedTransaction] = useState<AdminPaymentTransaction | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [reconciliationReason, setReconciliationReason] = useState("Customer debited; Hubtel callback did not arrive.");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadTransactions = async () => {
    setIsLoading(true);
    const { data, error } = await getAdminOverview();
    setTransactions(data?.paymentTransactions ?? []);
    setStaffRole(data?.staffRole ?? "");
    setError(error?.message ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const totals = useMemo(() => {
    return {
      total: transactions.length,
      successful: transactions.filter((transaction) => transaction.status === "successful").length,
      pending: transactions.filter((transaction) => ["initiated", "pending"].includes(transaction.status)).length,
      failed: transactions.filter((transaction) => ["failed", "cancelled", "reversed"].includes(transaction.status)).length,
    };
  }, [transactions]);

  const canManuallyConfirm = staffRole === "finance" || staffRole === "super_admin";

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reference = searchReference.trim();
    if (!reference) {
      setError("Enter a Hubtel provider reference to search.");
      return;
    }

    setError("");
    setMessage("");
    setSearchedTransaction(null);
    setIsSearching(true);
    const { data, error } = await findHubtelPayment(reference);
    setIsSearching(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSearchedTransaction(data);
    setMessage(`Loaded payment ${data?.provider_reference}. Review the details before confirming.`);
  };

  const handleReconcile = async (transaction: AdminPaymentTransaction) => {
    if (!transaction.provider_reference) return;

    const notes = reconciliationReason.trim();
    if (!notes) {
      setError("Enter a reconciliation reason before confirming the payment.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm Hubtel payment ${transaction.provider_reference} manually?\n\nOnly continue if Hubtel confirms the customer was debited.`,
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setReconcilingReference(transaction.provider_reference);
    const { error } = await reconcileHubtelPayment(transaction.provider_reference, notes);
    setReconcilingReference(null);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`Payment ${transaction.provider_reference} reconciled successfully.`);
    if (searchedTransaction?.provider_reference === transaction.provider_reference) {
      const { data } = await findHubtelPayment(transaction.provider_reference);
      setSearchedTransaction(data);
    }
    await loadTransactions();
  };

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Operations Portal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment records
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {message && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Transactions" value={totals.total} />
            <Metric label="Successful" value={totals.successful} />
            <Metric label="Pending" value={totals.pending} />
            <Metric label="Failed/cancelled" value={totals.failed} />
          </div>

          {canManuallyConfirm && (
            <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Manual reconciliation</p>
                  <h2 className="mt-1 font-display text-xl font-semibold">Search by Hubtel reference</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Use this only when Hubtel confirms the customer was debited but the callback did not arrive.</p>
                </div>
              </div>
              <form onSubmit={handleSearch} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={searchReference}
                  onChange={(event) => setSearchReference(event.target.value)}
                  placeholder="SC2606161404BF82"
                  className="h-11 rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {isSearching && <Loader2 className="h-4 w-4 animate-spin" />}
                  Search payment
                </button>
              </form>

              {searchedTransaction && (
                <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <Detail label="Reference" value={searchedTransaction.provider_reference ?? "none"} mono />
                    <Detail label="Customer" value={searchedTransaction.userName ?? searchedTransaction.userEmail ?? searchedTransaction.user_id} />
                    <Detail label="Amount" value={formatCurrency(Number(searchedTransaction.amount ?? 0), (searchedTransaction.currency || "GHS") as CurrencyCode)} />
                    <Detail label="Service" value={formatPaymentType(searchedTransaction.payment_type ?? "payment")} />
                    <Detail label="Payment status" value={searchedTransaction.status} />
                    <Detail label="Wallet status" value={searchedTransaction.walletStatus ?? "No wallet ledger entry"} />
                    <Detail label="Receipt" value={searchedTransaction.receiptId ?? "No receipt yet"} mono />
                    <Detail label="Created" value={formatDate(searchedTransaction.created_at)} />
                  </div>

                  {canReconcile(searchedTransaction, staffRole) ? (
                    <div className="mt-4 grid gap-3">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="reconciliation-reason">
                        Confirmation reason
                      </label>
                      <textarea
                        id="reconciliation-reason"
                        value={reconciliationReason}
                        onChange={(event) => setReconciliationReason(event.target.value)}
                        rows={3}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        disabled={reconcilingReference === searchedTransaction.provider_reference}
                        onClick={() => handleReconcile(searchedTransaction)}
                        className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {reconcilingReference === searchedTransaction.provider_reference ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Confirm Payment Manually
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                      This payment cannot be manually confirmed from its current state.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!canManuallyConfirm && (
            <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
              Manual reconciliation is restricted to Finance Admin and Super Admin.
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="grid min-w-[1220px] grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.9fr_0.8fr_0.9fr_1fr_0.9fr] gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>User</span>
              <span>Circle</span>
              <span>Amount</span>
              <span>Type</span>
              <span>Status</span>
              <span>Provider</span>
              <span>Reference</span>
              <span>Date</span>
              <span>Action</span>
            </div>
            <ul className="divide-y divide-border overflow-x-auto">
              {transactions.map((transaction) => (
                <li key={transaction.id} className="grid min-w-[1220px] grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.9fr_0.8fr_0.9fr_1fr_0.9fr] items-center gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{transaction.userName ?? transaction.userEmail ?? transaction.user_id}</p>
                    <p className="truncate text-xs text-muted-foreground">{transaction.userEmail ?? transaction.user_id}</p>
                  </div>
                  <p className="truncate text-xs font-medium text-muted-foreground">{transaction.circleName ?? transaction.circle_id ?? "No circle"}</p>
                  <p className="text-xs font-semibold">{formatCurrency(Number(transaction.amount ?? 0), (transaction.currency || "GHS") as CurrencyCode)}</p>
                  <p className="text-xs font-medium capitalize text-muted-foreground">{formatPaymentType(transaction.payment_type ?? "contribution")}</p>
                  <StatusPill status={transaction.status} />
                  <p className="text-xs font-medium uppercase text-muted-foreground">{transaction.provider}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{transaction.provider_reference ?? "none"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(transaction.created_at)}</p>
                  {canReconcile(transaction, staffRole) ? (
                    <button
                      type="button"
                      disabled={reconcilingReference === transaction.provider_reference}
                      onClick={() => handleReconcile(transaction)}
                      className="inline-flex w-fit items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {reconcilingReference === transaction.provider_reference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Reconcile
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No action</span>
                  )}
                </li>
              ))}
              {transactions.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>
              )}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function canReconcile(transaction: AdminPaymentTransaction, staffRole: string) {
  return ["finance", "super_admin"].includes(staffRole)
    && transaction.provider === "hubtel"
    && Boolean(transaction.provider_reference)
    && ["initiated", "pending"].includes(transaction.status);
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const good = status === "successful";
  const bad = ["failed", "cancelled", "reversed"].includes(status);
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${good ? "bg-success/15 text-success" : bad ? "bg-destructive/10 text-destructive" : "bg-gold/15 text-[color:var(--gold-foreground)]"}`}>
      {status}
    </span>
  );
}

function formatPaymentType(value: string) {
  return value.replace(/_/g, " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
