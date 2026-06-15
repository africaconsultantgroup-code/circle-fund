import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock, Loader2, ShieldAlert, Wallet, XCircle } from "lucide-react";
import { PaymentPreparationModal } from "@/components/payment-preparation-modal";
import { getCurrentUser } from "@/lib/auth";
import {
  initiateHubtelContributionPayment,
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

function PaymentsPage() {
  const [contributions, setContributions] = useState<ContributionWithCircle[]>([]);
  const [personalSusuDue, setPersonalSusuDue] = useState<PersonalSusuDue[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [paymentTransaction, setPaymentTransaction] = useState<PaymentTransaction | null>(null);
  const [error, setError] = useState("");

  const loadPayments = async () => {
    setIsLoading(true);
    setError("");

    const user = await getCurrentUser();
    if (!user) {
      setContributions([]);
      setPersonalSusuDue([]);
      setTransactions([]);
      setError("Please sign in to view payments.");
      setIsLoading(false);
      return;
    }

    const contributionResult = await supabase
      .from("contributions")
      .select("*, circles(id, name, base_currency)")
      .eq("user_id", user.id)
      .in("status", ["pending", "unpaid", "overdue", "late", "failed"])
      .order("due_date", { ascending: true });

    const transactionResult = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const planResult = await listPersonalSusuPlans(user.id);
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

    const errors = [contributionResult.error, transactionResult.error, planResult.error].filter(Boolean);
    if (errors.length > 0) {
      setError(errors.map((item) => item?.message).join(" "));
    }

    setContributions((contributionResult.data ?? []) as ContributionWithCircle[]);
    setTransactions(transactionResult.data ?? []);
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

  const handlePayContribution = async (contribution: ContributionWithCircle) => {
    setError("");
    setPreparingId(contribution.id);
    const { data, error } = await initiateHubtelContributionPayment(contribution.id);
    setPreparingId(null);

    if (error || !data) {
      setError(error?.message ?? "We could not prepare this contribution payment.");
      return;
    }

    setPaymentTransaction(data);
    await loadPayments();
  };

  const handlePayPersonalSusu = async (item: PersonalSusuDue) => {
    setError("");
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
      <h1 className="font-display text-2xl font-bold tracking-tight">Payments</h1>
      <p className="text-xs text-muted-foreground">Track outstanding balances and prepared Hubtel payments.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SummaryCard label="Amount due" value={formatCurrency(totals.totalDue, "GHS")} tone="plain" />
        <SummaryCard label="Prepared" value={String(totals.initiated)} tone="gold" />
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment obligations
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
                      <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDate(contribution.due_date)} · {formatStatus(contribution)}</p>
                    </div>
                    <p className="font-display text-sm font-semibold">{formatCurrency(amount, currency)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={preparingId === contribution.id || amount <= 0}
                    onClick={() => handlePayContribution(contribution)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {preparingId === contribution.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    Pay Contribution
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
                    <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDate(item.dueDate)} · active</p>
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
            <h2 className="font-display text-base font-semibold">Prepared payments</h2>
            <Link to="/transactions" className="text-xs font-medium text-primary">View activity</Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold capitalize">{transaction.payment_type.replace(/_/g, " ")}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{transaction.provider_reference ?? "No reference"} · {formatDate(transaction.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-semibold">{formatCurrency(Number(transaction.amount), (transaction.currency || "GHS") as CurrencyCode)}</p>
                  <p className="flex items-center justify-end gap-1 text-[10px] capitalize text-muted-foreground">
                    <StatusIcon status={transaction.status} /> {transaction.status}
                  </p>
                </div>
              </li>
            ))}
            {transactions.length === 0 && (
              <li className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow-card">
                No prepared payment records yet.
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
  if (status === "successful" || status === "completed") return <CheckCircle2 className="h-3 w-3 text-success" />;
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
