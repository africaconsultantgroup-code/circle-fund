import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Pause, Play, RefreshCw, XCircle } from "lucide-react";
import {
  automationTargetName,
  loadAutomationDashboard,
  setPaymentAutomationStatus,
  type AutomationDashboardData,
  type PaymentAutomation,
} from "@/lib/payment-automation";
import { formatCurrency } from "@/lib/diaspora";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/automation")({
  component: AutomationPage,
});

const emptyData: AutomationDashboardData = { automations: [], scheduledPayments: [], names: {} };

type ManualContribution = {
  id: string;
  amount: number;
  amount_due: number | null;
  due_date: string;
  status: string;
  circles: { name: string; base_currency: string } | null;
};

function AutomationPage() {
  const [data, setData] = useState(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [manualContributions, setManualContributions] = useState<ManualContribution[]>([]);

  const refresh = async () => {
    setIsLoading(true);
    const [result, contributionResult] = await Promise.all([
      loadAutomationDashboard(),
      supabase
        .from("contributions")
        .select("id,amount,amount_due,due_date,status,circles(name,base_currency)")
        .in("status", ["pending", "unpaid", "overdue", "late", "failed"])
        .order("due_date", { ascending: true }),
    ]);
    setData(result.data);
    setManualContributions((contributionResult.data ?? []) as ManualContribution[]);
    setError(result.error ?? contributionResult.error?.message ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    // Initial data hydration from Supabase is the effect's external synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const actionablePayments = useMemo(
    () =>
      data.scheduledPayments.filter((item) =>
        ["scheduled", "due", "processing", "failed", "retry_scheduled", "overdue"].includes(
          item.status,
        ),
      ),
    [data.scheduledPayments],
  );
  const automationById = useMemo(
    () => new Map(data.automations.map((item) => [item.id, item])),
    [data.automations],
  );
  const scheduledContributionIds = new Set(
    data.scheduledPayments.flatMap((item) => (item.contribution_id ? [item.contribution_id] : [])),
  );
  const manualOnly = manualContributions.filter((item) => !scheduledContributionIds.has(item.id));
  const totalDueThisMonth =
    actionablePayments
      .filter((item) => isCurrentMonth(item.due_date))
      .reduce((sum, item) => sum + Number(item.amount), 0) +
    manualOnly
      .filter((item) => isCurrentMonth(item.due_date))
      .reduce((sum, item) => sum + Number(item.amount_due ?? item.amount), 0);

  const changeStatus = async (
    automation: PaymentAutomation,
    action: "pause" | "resume" | "cancel",
  ) => {
    setChangingId(automation.id);
    setError("");
    const result = await setPaymentAutomationStatus(automation.id, action);
    setChangingId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await refresh();
  };

  return (
    <div className="flex flex-col px-5 pt-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Automation</h1>
          <p className="text-xs text-muted-foreground">
            AutoPay, AutoSave, and upcoming deductions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-border p-2 text-primary"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <section className="mt-5 rounded-3xl bg-gradient-card p-5 text-primary-foreground shadow-elevated">
        <p className="text-xs uppercase tracking-wide text-primary-foreground/70">
          Total due this month
        </p>
        <p className="mt-1 font-display text-2xl font-bold">
          {formatCurrency(totalDueThisMonth, "GHS")}
        </p>
        <p className="mt-2 text-xs text-primary-foreground/70">
          {actionablePayments.length + manualOnly.length} upcoming or unresolved payment(s).
        </p>
      </section>

      {error && (
        <p className="mt-4 rounded-2xl bg-destructive/5 p-3 text-xs text-destructive">{error}</p>
      )}
      {isLoading && (
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading automations
        </p>
      )}

      {!isLoading && (
        <>
          <Section title="Your automations" empty={data.automations.length === 0}>
            {data.automations.map((automation) => (
              <li
                key={automation.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-sm font-semibold">
                      {automationTargetName(automation, data.names)}
                    </p>
                    <p className="mt-1 text-[11px] capitalize text-muted-foreground">
                      {automation.automation_type.replace("_", " ")} · {automation.frequency}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold capitalize">
                    {automation.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Field label="Amount" value={formatCurrency(Number(automation.amount), "GHS")} />
                  <Field
                    label="Next deduction"
                    value={formatDate(automation.next_collection_date)}
                  />
                  <Field
                    label="Payment method"
                    value={automation.payment_method.replace("_", " ")}
                  />
                  <Field
                    label="Authorization"
                    value={automation.authorization_status.replace("_", " ")}
                  />
                </div>
                {["active", "paused"].includes(automation.status) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {automation.status === "active" ? (
                      <Action
                        icon={<Pause className="h-3.5 w-3.5" />}
                        label="Pause"
                        disabled={changingId === automation.id}
                        onClick={() => void changeStatus(automation, "pause")}
                      />
                    ) : (
                      <Action
                        icon={<Play className="h-3.5 w-3.5" />}
                        label="Resume"
                        disabled={changingId === automation.id}
                        onClick={() => void changeStatus(automation, "resume")}
                      />
                    )}
                    <Action
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      label="Cancel"
                      destructive
                      disabled={changingId === automation.id}
                      onClick={() => void changeStatus(automation, "cancel")}
                    />
                  </div>
                )}
              </li>
            ))}
          </Section>

          <Section
            title="Upcoming deductions"
            empty={actionablePayments.length === 0 && manualOnly.length === 0}
          >
            {actionablePayments.map((payment) => {
              const automation = automationById.get(payment.automation_id);
              return (
                <li
                  key={payment.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {automation
                          ? automationTargetName(automation, data.names)
                          : "Scheduled payment"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(payment.due_date)} ·{" "}
                        <span className="capitalize">{payment.payment_type.replace("_", " ")}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatCurrency(Number(payment.amount), "GHS")}
                      </p>
                      <p className="text-[10px] capitalize text-muted-foreground">
                        {payment.status.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                  {["due", "failed", "retry_scheduled", "overdue"].includes(payment.status) && (
                    <Link
                      to="/payments"
                      className="mt-3 block rounded-xl bg-gradient-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground"
                    >
                      Pay Now
                    </Link>
                  )}
                </li>
              );
            })}
            {manualOnly.map((contribution) => (
              <li
                key={contribution.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {contribution.circles?.name ?? "Circle contribution"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(contribution.due_date)} · Manual
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatCurrency(Number(contribution.amount_due ?? contribution.amount), "GHS")}
                  </p>
                </div>
                <Link
                  to="/payments"
                  className="mt-3 block rounded-xl bg-gradient-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground"
                >
                  Pay Now
                </Link>
              </li>
            ))}
          </Section>

          <p className="mb-6 mt-5 rounded-2xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Automatic provider deductions are not active yet. When a payment is due, SikaCircle will
            ask you to authorize it through the existing payment flow.
          </p>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {empty ? (
          <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nothing to show yet.
          </li>
        ) : (
          children
        )}
      </ul>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-semibold capitalize">{value}</p>
    </div>
  );
}

function Action({
  icon,
  label,
  disabled,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${destructive ? "border-destructive/30 text-destructive" : "border-border"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isCurrentMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
