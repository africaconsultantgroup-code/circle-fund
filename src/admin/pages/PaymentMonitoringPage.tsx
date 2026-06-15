import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { getAdminOverview, type AdminPaymentTransaction } from "@/admin/api";
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
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getAdminOverview().then(({ data, error }) => {
      if (!isMounted) return;
      setTransactions(data?.paymentTransactions ?? []);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    return {
      total: transactions.length,
      successful: transactions.filter((transaction) => transaction.status === "successful").length,
      pending: transactions.filter((transaction) => ["initiated", "pending"].includes(transaction.status)).length,
      failed: transactions.filter((transaction) => ["failed", "cancelled", "reversed"].includes(transaction.status)).length,
    };
  }, [transactions]);

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

      {!isLoading && !error && (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Transactions" value={totals.total} />
            <Metric label="Successful" value={totals.successful} />
            <Metric label="Pending" value={totals.pending} />
            <Metric label="Failed/cancelled" value={totals.failed} />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="grid min-w-[1080px] grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.9fr_0.8fr_0.9fr_1fr] gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>User</span>
              <span>Circle</span>
              <span>Amount</span>
              <span>Type</span>
              <span>Status</span>
              <span>Provider</span>
              <span>Reference</span>
              <span>Date</span>
            </div>
            <ul className="divide-y divide-border overflow-x-auto">
              {transactions.map((transaction) => (
                <li key={transaction.id} className="grid min-w-[1080px] grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.9fr_0.8fr_0.9fr_1fr] items-center gap-4 px-5 py-3 text-sm">
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
