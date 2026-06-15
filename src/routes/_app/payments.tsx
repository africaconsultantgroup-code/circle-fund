import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Loader2, ShieldAlert, Wallet, XCircle } from "lucide-react";
import { PaymentPreparationModal } from "@/components/payment-preparation-modal";
import { getCurrentUser } from "@/lib/auth";
import {
  initiatePlaceholderPayment,
  listPersonalSusuDeposits,
  listPersonalSusuPlans,
  type Contribution,
  type PaymentTransaction,
  type PersonalSusuPlan,
} from "@/lib/db";
import { formatCurrency } from "@/lib/diaspora";
import { supabase } from "@/lib/supabase";
import type { CurrencyCode } from "@/lib/supabase-types";
import { buildPlanMetrics } from "@/lib/piggy-bag";
import {
  getWalletSummary,
  listWalletTransactions,
  payContributionFromWallet,
  prepareWalletDeposit,
  walletMetadataString,
  walletPaymentMethodLabel,
  walletTransactionLabel,
  type WalletSummary,
  type WalletTransactionWithCircle,
} from "@/lib/wallet";

export const Route = createFileRoute("/_app/payments")({
  component: PaymentsPage,
});

type ContributionWithCircle = Contribution & {
  circles?: {
    id: string;
    name: string;
    base_currency: CurrencyCode;
  } | null;
};

type PersonalSusuDue = {
  plan: PersonalSusuPlan;
  amountDue: number;
  dueDate: string | null;
};

type DepositMethod = "mtn_momo" | "telecel_cash" | "airteltigo_money";

const depositMethods: Array<{ value: DepositMethod; label: string }> = [
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "telecel_cash", label: "Telecel Cash" },
  { value: "airteltigo_money", label: "AirtelTigo Money" },
];

function PaymentsPage() {
  const [contributions, setContributions] = useState<ContributionWithCircle[]>([]);
  const [personalSusuDue, setPersonalSusuDue] = useState<PersonalSusuDue[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionWithCircle[]>([]);
  const [depositAmount, setDepositAmount] = useState("100");
  const [depositMethod, setDepositMethod] = useState<DepositMethod>("mtn_momo");
  const [isLoading, setIsLoading] = useState(true);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [paymentTransaction, setPaymentTransaction] = useState<PaymentTransaction | null>(null);
  const [walletNotice, setWalletNotice] = useState("");
  const [error, setError] = useState("");

  const loadPayments = async () => {
    setIsLoading(true);
    setError("");

    const user = await getCurrentUser();
    if (!user) {
      setContributions([]);
      setPersonalSusuDue([]);
      setTransactions([]);
      setWalletSummary(null);
      setWalletTransactions([]);
      setError("Please sign in to view payments.");
      setIsLoading(false);
      return;
    }

    const [contributionResult, transactionResult, planResult, walletResult, walletTxResult] = await Promise.all([
      supabase
        .from("contributions")
        .select("*, circles(id, name, base_currency)")
        .eq("user_id", user.id)
        .in("status", ["pending", "unpaid", "overdue", "late", "failed"])
        .order("due_date", { ascending: true }),
      supabase
        .from("payment_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      listPersonalSusuPlans(user.id),
      getWalletSummary(),
      listWalletTransactions(12),
    ]);

    const planDues = await Promise.all(
      (planResult.data ?? [])
        .filter((plan) => plan.status === "active")
        .map(async (plan) => {
          const deposits = await listPersonalSusuDeposits(plan.id, user.id);
          const metrics = buildPlanMetrics(plan, deposits.data ?? []);
          return {
            plan,
            amountDue: metrics.metrics.expectedContributionPerPeriod || metrics.metrics.remainingBalance,
            dueDate: metrics.metrics.nextPaymentDate,
          };
        }),
    );

    const errors = [
      contributionResult.error,
      transactionResult.error,
      planResult.error,
      walletResult.error,
      walletTxResult.error,
    ].filter(Boolean);
    if (errors.length > 0) {
      setError(errors.map((item) => item?.message).join(" "));
    }

    setContributions((contributionResult.data ?? []) as ContributionWithCircle[]);
    setTransactions(transactionResult.data ?? []);
    setWalletSummary(walletResult.data);
    setWalletTransactions((walletTxResult.data ?? []) as WalletTransactionWithCircle[]);
    setPersonalSusuDue(planDues.filter((item) => item.amountDue > 0));
    setIsLoading(false);
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const totals = useMemo(() => {
    const contributionDue = contributions.reduce((sum, item) => sum + Number(item.amount_due ?? item.amount ?? 0), 0);
    const susuDue = personalSusuDue.reduce((sum, item) => sum + item.amountDue, 0);
    const initiated = transactions.filter((item) => item.status === "initiated" || item.status === "pending").length;

    return {
      contributionDue,
      susuDue,
      totalDue: contributionDue + susuDue,
      initiated,
    };
  }, [contributions, personalSusuDue, transactions]);

  const walletCurrency = (walletSummary?.currency || "GHS") as CurrencyCode;

  const handlePrepareDeposit = async () => {
    const amount = Number(depositAmount);
    setError("");
    setWalletNotice("");

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setPreparingId("wallet_deposit");
    const { data, error } = await prepareWalletDeposit({ amount, paymentMethod: depositMethod, currency: walletCurrency });
    setPreparingId(null);

    if (error || !data) {
      setError(error?.message ?? "We could not prepare this wallet deposit.");
      return;
    }

    setWalletNotice(`Deposit prepared through ${walletPaymentMethodLabel(depositMethod)}. Hubtel live collection is not enabled yet. Receipt: ${data.receipt_id}`);
    await loadPayments();
  };

  const handlePayContributionFromWallet = async (contribution: ContributionWithCircle) => {
    setError("");
    setWalletNotice("");
    setPreparingId(contribution.id);
    const { data, error } = await payContributionFromWallet(contribution.id);
    setPreparingId(null);

    if (error || !data) {
      setError(error?.message ?? "We could not pay this contribution from your wallet.");
      return;
    }

    setWalletNotice(`Contribution paid from Sika Wallet. Receipt: ${data.receipt_id}`);
    await loadPayments();
  };

  const handlePayPersonalSusu = async (item: PersonalSusuDue) => {
    setError("");
    setWalletNotice("");
    setPreparingId(item.plan.id);
    const { data, error } = await initiatePlaceholderPayment({
      paymentType: "personal_susu",
      amount: item.amountDue,
      currency: "GHS",
      metadata: {
        source: "payments_tab",
        planId: item.plan.id,
        planName: item.plan.name,
        dueDate: item.dueDate,
      },
    });
    setPreparingId(null);

    if (error || !data) {
      setError(error?.message ?? "We could not prepare this Personal Susu payment.");
      return;
    }

    setPaymentTransaction(data);
    await loadPayments();
  };

  return (
    <div className="flex flex-col px-5 pt-12">
      <h1 className="font-display text-2xl font-bold tracking-tight">Sika Wallet</h1>
      <p className="text-xs text-muted-foreground">Wallet balances, deposits, contribution payments, and receipts.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SummaryCard label="Available balance" value={formatCurrency(Number(walletSummary?.available_balance ?? 0), walletCurrency)} tone="gold" />
        <SummaryCard label="Locked balance" value={formatCurrency(Number(walletSummary?.locked_balance ?? 0), walletCurrency)} tone="plain" />
        <SummaryCard label="Total deposits" value={formatCurrency(Number(walletSummary?.total_deposits ?? 0), walletCurrency)} tone="plain" />
        <SummaryCard label="Total withdrawals" value={formatCurrency(Number(walletSummary?.total_withdrawals ?? 0), walletCurrency)} tone="plain" />
        <SummaryCard label="Monthly inflow" value={formatCurrency(Number(walletSummary?.monthly_inflow ?? 0), walletCurrency)} tone="plain" />
        <SummaryCard label="Monthly outflow" value={formatCurrency(Number(walletSummary?.monthly_outflow ?? 0), walletCurrency)} tone="plain" />
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Deposit funds</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Hubtel collection is prepared, but live money movement is still disabled.</p>
          </div>
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-medium">
            Amount
            <input
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              placeholder="100"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {depositMethods.map((method) => (
              <button
                key={method.value}
                type="button"
                onClick={() => setDepositMethod(method.value)}
                className={`rounded-xl border px-2 py-2 text-[11px] font-semibold ${depositMethod === method.value ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground"}`}
              >
                {method.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={preparingId === "wallet_deposit"}
            onClick={handlePrepareDeposit}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {preparingId === "wallet_deposit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownLeft className="h-4 w-4" />}
            Prepare Deposit
          </button>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SummaryCard label="Amount due" value={formatCurrency(totals.totalDue, "GHS")} tone="plain" />
        <SummaryCard label="Prepared payments" value={String(totals.initiated)} tone="plain" />
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {walletNotice && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{walletNotice}</p>
        </div>
      )}

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading wallet and payment obligations
        </div>
      )}

      {!isLoading && (
        <>
          <MoneySection title="Circle Contributions" emptyText="No circle contribution amount is due.">
            {contributions.map((contribution) => {
              const currency = contribution.circles?.base_currency ?? "GHS";
              const amount = Number(contribution.amount_due ?? contribution.amount ?? 0);
              return (
                <li key={contribution.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold">{contribution.circles?.name ?? "Circle contribution"}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDate(contribution.due_date)} - {formatStatus(contribution)}</p>
                    </div>
                    <p className="font-display text-sm font-semibold">{formatCurrency(amount, currency)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={preparingId === contribution.id || amount <= 0}
                    onClick={() => handlePayContributionFromWallet(contribution)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {preparingId === contribution.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    Pay from Wallet
                  </button>
                </li>
              );
            })}
          </MoneySection>

          <MoneySection title="Personal Susu" emptyText="No Personal Susu contribution is due.">
            {personalSusuDue.map((item) => (
              <li key={item.plan.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold">{item.plan.name}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDate(item.dueDate)} - active</p>
                  </div>
                  <p className="font-display text-sm font-semibold">{formatCurrency(item.amountDue, "GHS")}</p>
                </div>
                <button
                  type="button"
                  disabled={preparingId === item.plan.id}
                  onClick={() => handlePayPersonalSusu(item)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {preparingId === item.plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Pay Susu Contribution
                </button>
              </li>
            ))}
          </MoneySection>

          <div className="mt-7 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Wallet receipts</h2>
            <Link to="/transactions" className="text-xs font-medium text-primary">View all</Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {walletTransactions.map((transaction) => (
              <WalletTransactionRow key={transaction.id} transaction={transaction} />
            ))}
            {walletTransactions.length === 0 && (
              <li className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow-card">
                No wallet transactions yet.
              </li>
            )}
          </ul>
        </>
      )}

      <PaymentPreparationModal
        open={Boolean(paymentTransaction)}
        transaction={paymentTransaction}
        title="Payment prepared"
        onClose={() => setPaymentTransaction(null)}
      />
    </div>
  );
}

function WalletTransactionRow({ transaction }: { transaction: WalletTransactionWithCircle }) {
  const isInflow = transaction.direction === "inflow" || transaction.direction === "unlock";
  const circleName = transaction.circles?.name ?? walletMetadataString(transaction.metadata, "circle_name");
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isInflow ? "bg-gold/15 text-[color:var(--gold-foreground)]" : "bg-secondary text-primary"}`}>
        {isInflow ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{walletTransactionLabel(transaction.transaction_type)}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {transaction.receipt_id} - {circleName ?? walletPaymentMethodLabel(transaction.payment_method)} - {formatDate(transaction.created_at)}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-display text-sm font-semibold ${isInflow ? "text-success" : ""}`}>
          {isInflow ? "+" : "-"}{formatCurrency(Number(transaction.amount), (transaction.currency || "GHS") as CurrencyCode)}
        </p>
        <p className="flex items-center justify-end gap-1 text-[10px] capitalize text-muted-foreground">
          <StatusIcon status={transaction.status} /> {transaction.status}
        </p>
      </div>
    </li>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "plain" | "gold" }) {
  const className = tone === "gold" ? "bg-gradient-gold text-gold-foreground" : "border border-border bg-card";
  return (
    <div className={`rounded-2xl p-4 shadow-card ${className}`}>
      <p className={`text-[11px] uppercase tracking-wide ${tone === "gold" ? "text-gold-foreground/80" : "text-muted-foreground"}`}>{label}</p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function MoneySection({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  const isEmpty = items.length === 0;

  return (
    <section className="mt-7">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {isEmpty ? (
          <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">{emptyText}</li>
        ) : (
          items
        )}
      </ul>
    </section>
  );
}

export function StatusIcon({ status }: { status: string }) {
  if (status === "successful" || status === "completed" || status === "paid") return <CheckCircle2 className="h-3 w-3 text-success" />;
  if (status === "initiated" || status === "pending") return <Clock className="h-3 w-3 text-[color:var(--gold-foreground)]" />;
  return <XCircle className="h-3 w-3 text-destructive" />;
}

function formatStatus(contribution: Contribution) {
  if (contribution.status === "late") return "overdue";
  if (contribution.status === "pending") return "pending";
  return contribution.status;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
