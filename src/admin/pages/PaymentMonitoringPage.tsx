import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { getAdminOverview, reconcileHubtelPayment, type AdminPaymentTransaction } from "@/admin/api";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

type PaymentMonitoringPageProps = {
  title: string;
  description: string;
  emptyText: string;
};

export function PaymentMonitoringPage({ title, description, emptyText }: PaymentMonitoringPageProps) {
  const [transactions, setTransactions] = useState<AdminPaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reconcilingReference, setReconcilingReference] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadTransactions = async () => {
    setIsLoading(true);
    const { data, error } = await getAdminOverview();
    setTransactions(data?.paymentTransactions ?? []);
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

  const handleReconcile = async (transaction: AdminPaymentTransaction) => {
    if (!transaction.provider_reference) return;

    const notes = window.prompt(
      `Reconcile Hubtel payment ${transaction.provider_reference} as successful?\n\nOnly continue if Hubtel confirms the customer was debited.`,
      "Customer debited; Hubtel callback did not arrive.",
    );

    if (notes === null) return;

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
                  {canReconcile(transaction) ? (
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

function canReconcile(transaction: AdminPaymentTransaction) {
  return transaction.provider === "hubtel"
    && Boolean(transaction.provider_reference)
    && ["initiated", "pending"].includes(transaction.status);
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
