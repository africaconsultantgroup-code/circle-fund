import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock,
  LogIn,
  Loader2,
  PiggyBank,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { PaymentPreparationModal } from "@/components/payment-preparation-modal";
import { SavingsPlanner } from "@/components/savings-planner";
import { getCurrentUser, getCurrentUserProfile, type UserProfile } from "@/lib/auth";
import {
  initiateHubtelContributionPayment,
  initiatePlaceholderPayment,
  listPersonalSusuDeposits,
  listPersonalSusuPlans,
  type Contribution,
  type PaymentTransaction,
  type Payout,
} from "@/lib/db";
import { formatCurrency } from "@/lib/diaspora";
import { buildPlanMetrics } from "@/lib/piggy-bag";
import { supabase } from "@/lib/supabase";
import { loadUserCircles, type UserCircle } from "@/lib/user-circles";
import { getVerificationGateSummary, type VerificationGateSummary } from "@/lib/onboarding";
import type { CurrencyCode } from "@/lib/supabase-types";

type ContributionWithCircle = Contribution & {
  circles?: {
    id: string;
    name: string;
    base_currency: CurrencyCode;
  } | null;
};

type PayoutTurn = {
  schedule_id: string;
  circle_id: string;
  circle_name: string | null;
  payout_due_date: string | null;
  payout_amount: number;
  status: string;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  tone: "primary" | "gold" | "success";
  priority: "high" | "medium" | "low";
};

type CircleFinancialSummary = {
  circleId: string;
  myPosition: number | null;
  expectedPayoutDate: string | null;
  expectedPayoutAmount: number | null;
  contributionProgress: number;
  paidContributions: number;
  totalContributions: number;
};

type DashboardData = {
  profile: UserProfile | null;
  circles: UserCircle[];
  upcomingContributions: ContributionWithCircle[];
  totalContributed: number;
  totalReceived: number;
  piggyBoxBalance: number;
  savingsPlanBalance: number;
  nextPayout: PayoutTurn | null;
  circleFinancials: Record<string, CircleFinancialSummary>;
  notifications: NotificationItem[];
  error: string | null;
};

const emptyDashboard: DashboardData = {
  profile: null,
  circles: [],
  upcomingContributions: [],
  totalContributed: 0,
  totalReceived: 0,
  piggyBoxBalance: 0,
  savingsPlanBalance: 0,
  nextPayout: null,
  circleFinancials: {},
  notifications: [],
  error: null,
};

export function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [gateSummary, setGateSummary] = useState<VerificationGateSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPayment, setBusyPayment] = useState("");
  const [paymentTransaction, setPaymentTransaction] = useState<PaymentTransaction | null>(null);
  const [paymentError, setPaymentError] = useState("");

  const canUseCircles = Boolean(gateSummary?.canUseCircleActions);
  const nextContribution = dashboard.upcomingContributions[0] ?? null;
  const primaryCurrency = (nextContribution?.circles?.base_currency ?? dashboard.circles[0]?.baseCurrency ?? "GHS") as CurrencyCode;
  const totalFinancialPosition = dashboard.totalContributed + dashboard.piggyBoxBalance + dashboard.savingsPlanBalance;
  const unread = dashboard.notifications.length;
  const activeCreatorCircles = dashboard.circles.filter((circle) => circle.isCreator && circle.membershipStatus === "approved").length;
  const activeParticipationCircles = dashboard.circles.filter((circle) => ["pending", "approved"].includes(circle.membershipStatus)).length;
  const creatorLimitReached = activeCreatorCircles >= 2;
  const participationReviewNeeded = activeParticipationCircles >= 3;

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    const [data, gateResult] = await Promise.all([loadFinancialDashboard(), getVerificationGateSummary()]);
    setDashboard(data);
    setGateSummary(gateResult);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();

    const refresh = () => {
      if (document.visibilityState === "visible") void loadDashboard();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadDashboard]);

  const greetingName = dashboard.profile?.full_name?.split(" ")[0] || dashboard.profile?.email?.split("@")[0] || "there";

  const handlePayContribution = async (contribution: ContributionWithCircle) => {
    setPaymentError("");
    setBusyPayment(contribution.id);
    const { data, error } = await initiateHubtelContributionPayment(contribution.id);
    setBusyPayment("");

    if (error || !data) {
      setPaymentError(error?.message ?? "We could not prepare this contribution payment.");
      return;
    }

    setPaymentTransaction(data);
    void loadDashboard();
  };

  const handleFundPiggyBox = async () => {
    setPaymentError("");
    setBusyPayment("piggy_box");
    const { data, error } = await initiatePlaceholderPayment({
      paymentType: "piggy_bag",
      amount: 100,
      currency: "GHS",
      metadata: { source: "customer_dashboard", label: "quick_piggy_box_funding" },
    });
    setBusyPayment("");

    if (error || !data) {
      setPaymentError(error?.message ?? "We could not prepare Piggy Box funding.");
      return;
    }

    setPaymentTransaction(data);
    void loadDashboard();
  };

  const handleFundSavingsPlan = async () => {
    const amount = Number(nextContribution?.amount_due ?? nextContribution?.amount ?? dashboard.circles[0]?.amount ?? 100);
    setPaymentError("");
    setBusyPayment("savings_plan");
    const { data, error } = await initiatePlaceholderPayment({
      paymentType: "savings",
      amount,
      currency: primaryCurrency,
      metadata: {
        source: "customer_dashboard",
        label: "quick_savings_plan_funding",
        contributionId: nextContribution?.id ?? null,
      },
    });
    setBusyPayment("");

    if (error || !data) {
      setPaymentError(error?.message ?? "We could not prepare savings plan funding.");
      return;
    }

    setPaymentTransaction(data);
    void loadDashboard();
  };

  return (
    <div className="flex flex-col pb-8">
      <header className="bg-gradient-card px-5 pb-24 pt-12 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-primary-foreground/70">Welcome back,</p>
            <h1 className="font-display text-2xl font-bold tracking-tight">{greetingName}</h1>
            <p className="mt-1 text-xs text-primary-foreground/65">Your SikaCircle financial dashboard</p>
          </div>
          <Link to="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-gold" />}
          </Link>
        </div>

        <div className="mt-8">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/60">Tracked balance</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-tight">{formatCurrency(totalFinancialPosition, primaryCurrency)}</p>
          <p className="mt-2 text-xs text-primary-foreground/70">Contributions, Piggy Box, and prepared savings plans.</p>
        </div>
      </header>

      <div className="-mt-16 px-5">
        <div className="grid grid-cols-2 gap-3 rounded-3xl bg-card p-4 shadow-elevated">
          <SummaryTile icon={<Users className="h-4 w-4" />} label="Active Circles" value={String(dashboard.circles.length)} />
          <SummaryTile icon={<CalendarDays className="h-4 w-4" />} label="Upcoming" value={String(dashboard.upcomingContributions.length)} />
          <SummaryTile icon={<ArrowUpRight className="h-4 w-4" />} label="Contributed" value={formatCurrency(dashboard.totalContributed, primaryCurrency)} />
          <SummaryTile icon={<ArrowDownLeft className="h-4 w-4" />} label="Received" value={formatCurrency(dashboard.totalReceived, primaryCurrency)} />
        </div>
      </div>

      <section className="mt-5 px-5">
        {dashboard.error && (
          <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {dashboard.error}
          </div>
        )}
        {paymentError && (
          <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {paymentError}
          </div>
        )}
        <VerificationStatusCard gateSummary={gateSummary} />
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        <BalanceCard
          icon={<PiggyBank className="h-4 w-4" />}
          label="Piggy Box Balance"
          value={formatCurrency(dashboard.piggyBoxBalance, "GHS")}
          emptyText="No locked Piggy Box savings yet."
          actionLabel="Fund Piggy Box"
          loading={busyPayment === "piggy_box"}
          onAction={handleFundPiggyBox}
        />
        <BalanceCard
          icon={<Target className="h-4 w-4" />}
          label="Savings Plan Balance"
          value={formatCurrency(dashboard.savingsPlanBalance, "GHS")}
          emptyText="No savings plan payments prepared yet."
          actionLabel="Fund Savings Plan"
          loading={busyPayment === "savings_plan"}
          onAction={handleFundSavingsPlan}
        />
      </section>

      <section className="mt-5 px-5">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="h-4 w-4" />
            <h2 className="font-display text-sm font-semibold">Detailed balance breakdown</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <BreakdownMetric label="Total contributed" value={formatCurrency(dashboard.totalContributed, primaryCurrency)} />
            <BreakdownMetric label="Total received" value={formatCurrency(dashboard.totalReceived, primaryCurrency)} />
            <BreakdownMetric label="Piggy Box" value={formatCurrency(dashboard.piggyBoxBalance, "GHS")} />
            <BreakdownMetric label="Savings plan" value={formatCurrency(dashboard.savingsPlanBalance, primaryCurrency)} />
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        {canUseCircles ? (
          <>
            <Link
              to="/create-circle"
              className={`flex items-center gap-3 rounded-2xl p-4 shadow-card ${creatorLimitReached ? "pointer-events-none border border-border bg-card text-muted-foreground opacity-60" : "bg-gradient-primary text-primary-foreground"}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold">Create</p>
                <p className={`text-[11px] ${creatorLimitReached ? "text-muted-foreground" : "text-primary-foreground/70"}`}>{creatorLimitReached ? "2 admin limit reached" : "New circle"}</p>
              </div>
            </Link>
            <Link to="/join-circle" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <LogIn className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold">Join</p>
                <p className="text-[11px] text-muted-foreground">With invite</p>
              </div>
            </Link>
          </>
        ) : (
          <>
            <DisabledAction icon={<Plus className="h-5 w-5" />} title="Create" />
            <DisabledAction icon={<LogIn className="h-5 w-5" />} title="Join" />
          </>
        )}
      </section>

      {(creatorLimitReached || participationReviewNeeded) && (
        <section className="mt-3 px-5">
          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[color:var(--gold-foreground)]">
            <p className="font-display text-sm font-semibold">Circle capacity rules</p>
            {creatorLimitReached && <p className="mt-1 text-xs">You can only administer 2 active susu groups at a time.</p>}
            {participationReviewNeeded && <p className="mt-1 text-xs">You are already in 3 active susu groups. New join requests may need SikaCircle capacity review.</p>}
          </div>
        </section>
      )}

      <section className="mt-7 px-5">
        <SectionHeader title="Next Payout Date" actionTo="/circles" actionLabel="View circles" />
        {dashboard.nextPayout ? (
          <div className="mt-3 rounded-3xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-base font-semibold">{dashboard.nextPayout.circle_name ?? "Susu payout"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(dashboard.nextPayout.payout_due_date)}</p>
              </div>
              <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-semibold uppercase text-[color:var(--gold-foreground)]">
                {dashboard.nextPayout.status}
              </span>
            </div>
            <p className="mt-4 font-display text-2xl font-bold">{formatCurrency(Number(dashboard.nextPayout.payout_amount), primaryCurrency)}</p>
          </div>
        ) : (
          <EmptyState icon={<Clock className="h-4 w-4" />} text="No payout date is scheduled yet. Your payout turn will appear after a circle rotation is generated." />
        )}
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="Upcoming Contributions" actionTo="/payments" actionLabel="Pay" />
        {dashboard.upcomingContributions.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {dashboard.upcomingContributions.slice(0, 3).map((contribution) => {
              const currency = contribution.circles?.base_currency ?? primaryCurrency;
              return (
                <li key={contribution.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-sm font-semibold">{contribution.circles?.name ?? "Circle contribution"}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDate(contribution.due_date)} · {formatContributionStatus(contribution.status)}</p>
                    </div>
                    <p className="font-display text-sm font-semibold">{formatCurrency(Number(contribution.amount_due ?? contribution.amount ?? 0), currency)}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busyPayment === contribution.id}
                    onClick={() => handlePayContribution(contribution)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {busyPayment === contribution.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    Pay Contribution
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<CircleDollarSign className="h-4 w-4" />} text="No contribution payments are due right now." />
        )}
      </section>

      <SavingsPlanner
        defaultTargetAmount={Number(nextContribution?.amount_due ?? nextContribution?.amount ?? dashboard.circles[0]?.amount ?? 1000)}
        defaultDueDate={toDateInputValue(nextContribution?.due_date ?? dashboard.circles[0]?.nextPayoutDate)}
        currency={primaryCurrency}
      />

      <section className="mt-7 px-5">
        <SectionHeader title="Active Circles" actionTo="/circles" actionLabel="View all" />
        {dashboard.circles.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {dashboard.circles.slice(0, 3).map((circle) => (
              <li key={circle.id}>
                <Link to="/circle/$id" params={{ id: circle.id }} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary font-display text-base font-semibold text-primary-foreground">
                    {circle.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold">{circle.name}</p>
                    <CircleProgressDetails circle={circle} financial={dashboard.circleFinancials[circle.id]} />
                    <p className="text-[11px] text-muted-foreground">
                      {circle.memberCount}/{circle.maxMembers} members · {formatCurrency(circle.amount, circle.baseCurrency)}/{circle.frequency}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Users className="h-4 w-4" />} text="You have no active circles yet. Create or join one to get started." />
        )}
      </section>

      <section className="mt-7 px-5">
        <SectionHeader title="Notifications" actionTo="/notifications" actionLabel="Open" />
        {dashboard.notifications.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {dashboard.notifications.map((notification) => (
              <li key={notification.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display text-sm font-semibold">{notification.title}</p>
                  <PriorityPill priority={notification.priority} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{notification.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Bell className="h-4 w-4" />} text="No notifications yet." />
        )}
      </section>

      <PaymentPreparationModal
        open={Boolean(paymentTransaction)}
        transaction={paymentTransaction}
        title="Payment prepared"
        onClose={() => setPaymentTransaction(null)}
      />
    </div>
  );
}

async function loadFinancialDashboard(): Promise<DashboardData> {
  const [profile, user, circleResult] = await Promise.all([getCurrentUserProfile(), getCurrentUser(), loadUserCircles()]);
  if (!user) {
    return { ...emptyDashboard, error: "Please sign in to view your financial dashboard." };
  }

  const [upcomingResult, allContributionsResult, paidContributionsResult, payoutsResult, savingsTransactionsResult, piggyResult, payoutTurnResult, payoutTurnsResult] = await Promise.all([
    supabase
      .from("contributions")
      .select("*, circles(id, name, base_currency)")
      .eq("user_id", user.id)
      .in("status", ["pending", "unpaid", "overdue", "late", "failed"])
      .order("due_date", { ascending: true }),
    supabase
      .from("contributions")
      .select("circle_id, status")
      .eq("user_id", user.id),
    supabase
      .from("contributions")
      .select("amount, amount_due, status")
      .eq("user_id", user.id)
      .in("status", ["paid", "processed"]),
    supabase
      .from("payouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("payment_transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("payment_type", "savings")
      .in("status", ["initiated", "pending", "successful"]),
    loadPiggyBalance(user.id),
    loadNextPayoutTurn(user.id),
    loadPayoutTurns(user.id),
  ]);

  const errors = [
    circleResult.error,
    upcomingResult.error?.message,
    allContributionsResult.error?.message,
    paidContributionsResult.error?.message,
    payoutsResult.error?.message,
    savingsTransactionsResult.error?.message,
    piggyResult.error,
    payoutTurnResult.error,
    payoutTurnsResult.error,
  ].filter(Boolean);

  const totalContributed = (paidContributionsResult.data ?? []).reduce(
    (sum, contribution) => sum + Number(contribution.amount_due ?? contribution.amount ?? 0),
    0,
  );
  const totalReceived = ((payoutsResult.data ?? []) as Payout[]).reduce((sum, payout) => sum + Number(payout.amount ?? 0), 0);
  const savingsPlanBalance = ((savingsTransactionsResult.data ?? []) as PaymentTransaction[]).reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

  return {
    profile,
    circles: circleResult.data,
    upcomingContributions: (upcomingResult.data ?? []) as ContributionWithCircle[],
    totalContributed,
    totalReceived,
    piggyBoxBalance: piggyResult.balance,
    savingsPlanBalance,
    nextPayout: payoutTurnResult.data,
    circleFinancials: buildCircleFinancials(circleResult.data, allContributionsResult.data ?? [], payoutTurnsResult.data),
    notifications: buildNotifications({
      upcomingContributions: (upcomingResult.data ?? []) as ContributionWithCircle[],
      nextPayout: payoutTurnResult.data,
      piggyBoxBalance: piggyResult.balance,
      participationReviewNeeded: circleResult.data.filter((circle) => ["pending", "approved"].includes(circle.membershipStatus)).length >= 3,
    }),
    error: errors.length > 0 ? errors.join(" ") : null,
  };
}

async function loadPiggyBalance(userId: string) {
  const planResult = await listPersonalSusuPlans(userId);
  if (planResult.error) return { balance: 0, error: planResult.error.message };

  const metrics = await Promise.all(
    (planResult.data ?? []).map(async (plan) => {
      const deposits = await listPersonalSusuDeposits(plan.id, userId);
      return deposits.error ? null : buildPlanMetrics(plan, deposits.data ?? []);
    }),
  );

  return {
    balance: metrics.filter(Boolean).reduce((sum, item) => sum + (item?.lockedBalance ?? 0) + (item?.availableBalance ?? 0), 0),
    error: null,
  };
}

async function loadNextPayoutTurn(userId: string) {
  const { data, error } = await supabase
    .from("payout_schedule")
    .select("id, circle_id, payout_due_date, payout_amount, status, circles(name), circle_members!inner(user_id)")
    .eq("circle_members.user_id", userId)
    .in("status", ["scheduled", "pending"])
    .order("payout_due_date", { ascending: true })
    .limit(1);

  if (error) return { data: null, error: error.message };
  const row = (data?.[0] ?? null) as {
    id: string;
    circle_id: string;
    payout_due_date: string | null;
    payout_amount: number;
    status: string;
    circles?: { name?: string | null } | { name?: string | null }[] | null;
  } | null;

  if (!row) return { data: null, error: null };
  const circle = Array.isArray(row.circles) ? row.circles[0] : row.circles;

  return {
    data: {
      schedule_id: row.id,
      circle_id: row.circle_id,
      circle_name: circle?.name ?? null,
      payout_due_date: row.payout_due_date,
      payout_amount: Number(row.payout_amount ?? 0),
      status: row.status,
    },
    error: null,
  };
}

async function loadPayoutTurns(userId: string) {
  const { data, error } = await supabase
    .from("payout_schedule")
    .select("id, circle_id, rotation_position, payout_due_date, payout_amount, status, circle_members!inner(user_id)")
    .eq("circle_members.user_id", userId);

  if (error) return { data: [] as Array<PayoutTurn & { rotation_position: number }>, error: error.message };

  return {
    data: (data ?? []).map((row) => ({
      schedule_id: row.id,
      circle_id: row.circle_id,
      circle_name: null,
      payout_due_date: row.payout_due_date,
      payout_amount: Number(row.payout_amount ?? 0),
      status: row.status,
      rotation_position: Number(row.rotation_position ?? 0),
    })),
    error: null,
  };
}

function buildCircleFinancials(
  circles: UserCircle[],
  contributionRows: Array<{ circle_id: string; status: string }>,
  payoutTurns: Array<PayoutTurn & { rotation_position: number }>,
) {
  return circles.reduce<Record<string, CircleFinancialSummary>>((acc, circle) => {
    const contributions = contributionRows.filter((row) => row.circle_id === circle.id);
    const paidContributions = contributions.filter((row) => ["paid", "processed"].includes(row.status)).length;
    const totalContributions = contributions.length;
    const payoutTurn = payoutTurns.find((turn) => turn.circle_id === circle.id);

    acc[circle.id] = {
      circleId: circle.id,
      myPosition: payoutTurn?.rotation_position || null,
      expectedPayoutDate: payoutTurn?.payout_due_date ?? null,
      expectedPayoutAmount: payoutTurn?.payout_amount ?? null,
      contributionProgress: totalContributions > 0 ? Math.round((paidContributions / totalContributions) * 100) : 0,
      paidContributions,
      totalContributions,
    };

    return acc;
  }, {});
}

function buildNotifications({
  upcomingContributions,
  nextPayout,
  piggyBoxBalance,
  participationReviewNeeded,
}: {
  upcomingContributions: ContributionWithCircle[];
  nextPayout: PayoutTurn | null;
  piggyBoxBalance: number;
  participationReviewNeeded: boolean;
}) {
  const items: NotificationItem[] = [];
  const dueSoon = upcomingContributions.find((contribution) => daysUntil(contribution.due_date) <= 7);

  if (dueSoon) {
    items.push({
      id: `contribution-${dueSoon.id}`,
      title: "Contribution due soon",
      body: `${dueSoon.circles?.name ?? "A circle"} has a contribution due ${formatDate(dueSoon.due_date)}.`,
      tone: "gold",
      priority: daysUntil(dueSoon.due_date) <= 2 ? "high" : "medium",
    });
  }

  if (nextPayout) {
    items.push({
      id: `payout-${nextPayout.schedule_id}`,
      title: "Payout turn scheduled",
      body: `${nextPayout.circle_name ?? "Your circle"} payout is scheduled for ${formatDate(nextPayout.payout_due_date)}.`,
      tone: "success",
      priority: "medium",
    });
  }

  if (piggyBoxBalance > 0) {
    items.push({
      id: "piggy-balance",
      title: "Piggy Box balance updated",
      body: `${formatCurrency(piggyBoxBalance, "GHS")} is tracked in your Piggy Box.`,
      tone: "primary",
      priority: "low",
    });
  }

  if (participationReviewNeeded) {
    items.push({
      id: "capacity-review-rule",
      title: "Capacity review may apply",
      body: "You are in 3 active susu groups. Any new join request may need SikaCircle review.",
      tone: "gold",
      priority: "medium",
    });
  }

  return items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)).slice(0, 4);
}

function VerificationStatusCard({ gateSummary }: { gateSummary: VerificationGateSummary | null }) {
  const statuses = gateSummary?.statuses;
  const complete = Boolean(gateSummary?.isEligible);
  const formsComplete = Boolean(gateSummary?.formsComplete);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${complete ? "bg-success/10 text-success" : "bg-gold/20 text-[color:var(--gold-foreground)]"}`}>
          {complete ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </span>
        <div className="flex-1">
          <p className="font-display text-sm font-semibold">Verification status</p>
          {complete && <p className="text-[11px] text-muted-foreground">Verification complete. Circle actions are unlocked.</p>}
          {!complete && formsComplete && <p className="text-[11px] text-muted-foreground">Verification forms complete. Review is pending.</p>}
          {!complete && !formsComplete && <p className="text-[11px] text-muted-foreground">Continue verification before money movement starts.</p>}
        </div>
        <Link to={complete || formsComplete ? "/verify/status" : gateSummary?.nextStep.to ?? "/verify"} className="text-xs font-semibold text-primary">
          {complete ? "Status" : "Continue"}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatusLine label="Phone" value={statusLabel(statuses?.phone)} good={statuses?.phone === "verified"} />
        <StatusLine label="KYC" value={statusLabel(statuses?.ghanaCard)} good={statusAccepted(statuses?.ghanaCard)} />
      </div>
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-base font-semibold">{value}</p>
    </div>
  );
}

function BalanceCard({
  icon,
  label,
  value,
  emptyText,
  actionLabel,
  loading,
  onAction,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  emptyText: string;
  actionLabel?: string;
  loading?: boolean;
  onAction?: () => void;
}) {
  const isEmpty = value.includes("0.00") || value.endsWith("0");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-lg font-semibold">{value}</p>
      {isEmpty && <p className="mt-1 text-[11px] text-muted-foreground">{emptyText}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          disabled={loading}
          onClick={onAction}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-[11px] font-semibold text-primary disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function BreakdownMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function CircleProgressDetails({ circle, financial }: { circle: UserCircle; financial?: CircleFinancialSummary }) {
  const progress = financial?.contributionProgress ?? 0;

  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-1.5">
        <MiniMetric label="My Position" value={financial?.myPosition ? `#${financial.myPosition}` : "Not set"} />
        <MiniMetric label="Expected Payout" value={formatDate(financial?.expectedPayoutDate ?? circle.nextPayoutDate)} />
        <MiniMetric label="Members" value={`${circle.memberCount}/${circle.maxMembers}`} />
        <MiniMetric label="Progress" value={`${progress}%`} />
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold">{value}</p>
    </div>
  );
}

function PriorityPill({ priority }: { priority: NotificationItem["priority"] }) {
  const classes = priority === "high"
    ? "bg-destructive/10 text-destructive"
    : priority === "medium"
      ? "bg-gold/15 text-[color:var(--gold-foreground)]"
      : "bg-secondary text-primary";

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${classes}`}>
      {priority}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
      <p>{text}</p>
    </div>
  );
}

function StatusLine({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold ${good ? "text-success" : "text-muted-foreground"}`}>{value}</p>
    </div>
  );
}

function DisabledAction({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <button disabled className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left opacity-50 shadow-card">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span>
      <div>
        <p className="font-display text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground">Verify first</p>
      </div>
    </button>
  );
}

export function SectionHeader({ title, actionTo, actionLabel }: { title: string; actionTo?: string; actionLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {actionTo && actionLabel && (
        <Link to={actionTo} className="text-xs font-medium text-primary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function statusLabel(status: string | undefined) {
  if (status === "verified") return "Verified";
  if (status === "manual_review" || status === "pending") return "Pending review";
  if (status === "failed") return "Failed";
  return "Not started";
}

function statusAccepted(status: string | undefined) {
  return status === "verified" || status === "manual_review" || status === "pending";
}

function formatContributionStatus(status: string) {
  if (status === "late") return "overdue";
  return status.replace("_", " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function daysUntil(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((parsed.getTime() - Date.now()) / msPerDay);
}

function priorityRank(priority: NotificationItem["priority"]) {
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}
