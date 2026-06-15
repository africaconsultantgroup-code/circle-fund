import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ArrowDownLeft, ArrowUpRight, Filter, Loader2, ShieldAlert } from "lucide-react";
import { StatusIcon } from "./_app/payments";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";
import {
  listWalletTransactions,
  walletMetadataString,
  walletPaymentMethodLabel,
  walletTransactionLabel,
  type WalletTransactionWithCircle,
} from "@/lib/wallet";

export const Route = createFileRoute("/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const [transactions, setTransactions] = useState<WalletTransactionWithCircle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTransactions() {
      setIsLoading(true);
      setError("");
      const { data, error: transactionError } = await listWalletTransactions(80);
      if (transactionError) setError(transactionError.message);
      setTransactions((data ?? []) as WalletTransactionWithCircle[]);
      setIsLoading(false);
    }

    void loadTransactions();
  }, []);

  const groups = useMemo(() => {
    return transactions.reduce<Record<string, WalletTransactionWithCircle[]>>((acc, transaction) => {
      const date = monthLabel(transaction.created_at);
      (acc[date] ??= []).push(transaction);
      return acc;
    }, {});
  }, [transactions]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader
        title="Transactions"
        back="/profile"
        right={<button className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><Filter className="h-4 w-4" /></button>}
      />
      <div className="p-5">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-1.5 text-xs font-medium">
          {["All", "Payments", "Payouts"].map((label, index) => (
            <button key={label} className={`rounded-xl py-2 ${index === 0 ? "bg-card text-primary shadow-card" : "text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading wallet transactions
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!isLoading && !error && transactions.length === 0 && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground shadow-card">
            No wallet transaction records yet.
          </div>
        )}

        <div className="mt-5 flex flex-col gap-5">
          {Object.entries(groups).map(([date, items]) => (
            <div key={date}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{date}</p>
              <ul className="flex flex-col gap-2">
                {items.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: WalletTransactionWithCircle }) {
  const isInflow = transaction.direction === "inflow" || transaction.direction === "unlock";
  const circleName = transaction.circles?.name ?? walletMetadataString(transaction.metadata, "circle_name");
  const title = circleName ?? walletTransactionLabel(transaction.transaction_type);
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isInflow ? "bg-gold/15 text-[color:var(--gold-foreground)]" : "bg-secondary text-primary"}`}>
        {isInflow ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="flex items-center gap-1 truncate text-[11px] capitalize text-muted-foreground">
          <StatusIcon status={transaction.status} /> {walletTransactionLabel(transaction.transaction_type)} - {transaction.status}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          Receipt {transaction.receipt_id} - {walletPaymentMethodLabel(transaction.payment_method)}
        </p>
      </div>
      <p className={`font-display text-sm font-semibold ${isInflow ? "text-success" : ""}`}>
        {isInflow ? "+" : "-"}{formatCurrency(Number(transaction.amount), (transaction.currency || "GHS") as CurrencyCode)}
      </p>
    </li>
  );
}

function monthLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
