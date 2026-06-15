import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, LockKeyhole, PiggyBank, ShieldAlert, Wallet } from "lucide-react";
import { PaymentPreparationModal } from "@/components/payment-preparation-modal";
import { PageHeader } from "@/components/page-header";
import { initiatePlaceholderPayment, type PaymentTransaction } from "@/lib/db";
import { formatGHS } from "@/lib/mock-data";
import { formatDate, loadPiggyPlan, recordPiggyDeposit, type PiggyPlanWithMetrics } from "@/lib/piggy-bag";

export function PiggyBagDetailPage({ planId }: { planId: string }) {
  const [details, setDetails] = useState<PiggyPlanWithMetrics | null>(null);
  const [depositAmount, setDepositAmount] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDeposit, setIsSavingDeposit] = useState(false);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [paymentTransaction, setPaymentTransaction] = useState<PaymentTransaction | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadDetails = async () => {
    setIsLoading(true);
    const result = await loadPiggyPlan(planId);
    setDetails(result.data);
    setError(result.error ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    void loadDetails();
  }, [planId]);

  const handleRecordDeposit = async () => {
    setMessage("");
    setError("");

    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      setError("Enter a deposit amount greater than 0.");
      return;
    }

    setIsSavingDeposit(true);
    const result = await recordPiggyDeposit(planId, depositAmount);
    setIsSavingDeposit(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setMessage("Deposit recorded and locked in Piggy Bag. Hubtel collections can replace this preparation step later.");
    await loadDetails();
  };

  const handlePreparePiggyPayment = async () => {
    setMessage("");
    setError("");

    if (!details) return;

    const amount = depositAmount || details.metrics.expectedContributionPerPeriod || details.metrics.remainingBalance;
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("No amount is due for this Personal Susu plan.");
      return;
    }

    setIsPreparingPayment(true);
    const { data, error } = await initiatePlaceholderPayment({
      paymentType: "personal_susu",
      amount,
      currency: "GHS",
      metadata: {
        source: "piggy_bag_detail",
        planId: details.plan.id,
        planName: details.plan.name,
        targetAmount: details.plan.target_amount,
        dueDate: details.metrics.nextPaymentDate,
        lockedUntil: details.plan.locked_until,
      },
    });
    setIsPreparingPayment(false);

    if (error || !data) {
      setError(error?.message ?? "We could not prepare this Personal Susu payment. Please try again.");
      return;
    }

    setPaymentTransaction(data);
    setMessage("Hubtel payment is being prepared. Real payment will be enabled once API credentials are added.");
  };

  const handleWithdrawalRequest = () => {
    setMessage("Withdrawal request is ready for the future Hubtel payout workflow.");
    setError("");
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Piggy Bag" subtitle={details?.plan.name ?? "Locked savings"} back="/piggy-bag" />

      {isLoading && (
        <div className="flex flex-1 items-center justify-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Piggy Bag
        </div>
      )}

      {!isLoading && error && !details && (
        <div className="p-5">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        </div>
      )}

      {details && (
        <div className="flex flex-1 flex-col gap-5 p-5">
          <section className="rounded-3xl bg-gradient-card p-5 text-primary-foreground shadow-elevated">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Goal</p>
                <h1 className="mt-1 font-display text-2xl font-bold">{details.plan.name}</h1>
                <p className="mt-1 text-xs text-primary-foreground/70">{details.plan.frequency} savings until {formatDate(details.plan.locked_until)}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <PiggyBank className="h-6 w-6" />
              </span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gold" style={{ width: `${details.metrics.progressPercentage}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <HeroMetric label="Saved" value={formatGHS(Number(details.plan.target_amount) - details.metrics.remainingBalance)} />
              <HeroMetric label="Progress" value={`${details.metrics.progressPercentage}%`} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <BalanceTile icon={<LockKeyhole className="h-4 w-4" />} label="Locked" value={formatGHS(details.lockedBalance)} />
            <BalanceTile icon={<Wallet className="h-4 w-4" />} label="Available" value={formatGHS(details.availableBalance)} />
            <BalanceTile icon={<CalendarDays className="h-4 w-4" />} label="Next payment" value={details.metrics.nextPaymentDate ? formatDate(details.metrics.nextPaymentDate) : "Complete"} />
            <BalanceTile icon={<PiggyBank className="h-4 w-4" />} label="Per period" value={formatGHS(details.metrics.expectedContributionPerPeriod)} />
          </section>

          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
                <Wallet className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold">Add deposit</p>
                <p className="mt-1 text-[11px] text-muted-foreground">This records savings against the plan and locks it until the target date. Hubtel collections will use this plan and reference later.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3">
                <span className="text-sm font-semibold text-muted-foreground">GHS</span>
                <input
                  type="number"
                  min={1}
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(Number(event.target.value))}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isSavingDeposit}
                onClick={handleRecordDeposit}
                className="rounded-2xl bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {isSavingDeposit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
            </div>
            <button
              type="button"
              disabled={isPreparingPayment}
              onClick={handlePreparePiggyPayment}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 py-3 text-sm font-semibold text-primary disabled:opacity-60"
            >
              {isPreparingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Pay Susu Contribution
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Contribution amount: <span className="font-semibold text-foreground">{formatGHS(depositAmount)}</span>
              {" "}Due date: <span className="font-semibold text-foreground">{details.metrics.nextPaymentDate ? formatDate(details.metrics.nextPaymentDate) : formatDate(details.plan.locked_until)}</span>
            </p>
          </section>

          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${details.canWithdraw ? "bg-success/10 text-success" : "bg-gold/20 text-[color:var(--gold-foreground)]"}`}>
                <LockKeyhole className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold">Withdrawal</p>
                {!details.canWithdraw ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">This money is locked until {formatDate(details.plan.locked_until)}.</p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">Savings are unlocked. Full KYC can be required before payout in the next phase.</p>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={!details.canWithdraw}
              onClick={handleWithdrawalRequest}
              className="mt-4 w-full rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
            >
              {details.canWithdraw ? "Request withdrawal" : "Withdrawal locked"}
            </button>
          </section>

          {message && (
            <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-success">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-[11px] font-medium">{message}</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
              <ShieldAlert className="h-4 w-4" />
              <p className="text-[11px] font-medium">{error}</p>
            </div>
          )}

          <section>
            <h2 className="font-display text-base font-semibold">Deposit history</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {details.deposits.length === 0 && (
                <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
                  No deposits yet.
                </li>
              )}
              {details.deposits.map((deposit) => (
                <li key={deposit.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div>
                    <p className="font-display text-sm font-semibold">{formatGHS(Number(deposit.amount))}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(deposit.deposited_at)} - {deposit.provider ?? "manual"}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{deposit.payment_status}</span>
                </li>
              ))}
            </ul>
          </section>

          <PaymentPreparationModal
            open={Boolean(paymentTransaction)}
            transaction={paymentTransaction}
            title="Personal Susu payment prepared"
            onClose={() => setPaymentTransaction(null)}
          />
        </div>
      )}
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wide text-primary-foreground/70">{label}</p>
      <p className="mt-1 font-display text-base font-semibold">{value}</p>
    </div>
  );
}

function BalanceTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-sm font-semibold">{value}</p>
    </div>
  );
}
