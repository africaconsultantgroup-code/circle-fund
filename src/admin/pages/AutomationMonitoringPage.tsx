import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import {
  loadAdminAutomations,
  type PaymentAutomation,
  type ScheduledPayment,
} from "@/lib/payment-automation";
import { formatCurrency } from "@/lib/diaspora";

export function AutomationMonitoringPage() {
  const [automations, setAutomations] = useState<PaymentAutomation[]>([]);
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadAdminAutomations().then((result) => {
      setAutomations(result.automations);
      setPayments(result.payments);
      setError(result.error ?? "");
      setIsLoading(false);
    });
  }, []);

  const counts = useMemo(
    () => ({
      active: automations.filter((item) => item.status === "active").length,
      due: payments.filter(
        (item) => item.status === "due" && item.due_date === new Date().toISOString().slice(0, 10),
      ).length,
      processing: payments.filter((item) => item.status === "processing").length,
      failed: payments.filter((item) => item.status === "failed").length,
      retry: payments.filter((item) => item.status === "retry_scheduled").length,
      overdue: payments.filter((item) => item.status === "overdue").length,
      successful: payments.filter((item) => item.status === "successful").length,
    }),
    [automations, payments],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Payment automation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only monitoring for AutoPay, AutoSave, retries, and overdue payments.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(counts).map(([label, count]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>
      {error && (
        <p className="rounded-2xl bg-destructive/5 p-4 text-sm text-destructive">{error}</p>
      )}
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading scheduled payments
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-display font-semibold">Recent scheduled payments</h2>
          </div>
          <div className="divide-y divide-border">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="grid gap-3 p-4 text-sm md:grid-cols-[1.4fr_1fr_1fr_1fr]"
              >
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <span className="font-medium capitalize">
                    {payment.payment_type.replace("_", " ")}
                  </span>
                </div>
                <span>
                  {formatCurrency(Number(payment.amount), "GHS")} · {payment.due_date}
                </span>
                <span className="capitalize">{payment.status.replace("_", " ")}</span>
                <span className="truncate text-muted-foreground">
                  {payment.failure_reason ?? payment.provider_reference ?? "No investigation note"}
                </span>
              </div>
            ))}
            {payments.length === 0 && (
              <p className="p-5 text-sm text-muted-foreground">No scheduled payments yet.</p>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Successful status is read-only here and must come from provider confirmation or the existing
        controlled reconciliation flow.
      </p>
    </div>
  );
}
