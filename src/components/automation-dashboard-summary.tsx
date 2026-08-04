import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  automationTargetName,
  loadAutomationDashboard,
  type AutomationDashboardData,
} from "@/lib/payment-automation";
import { formatCurrency } from "@/lib/diaspora";

const emptyData: AutomationDashboardData = { automations: [], scheduledPayments: [], names: {} };

export function AutomationDashboardSummary() {
  const [data, setData] = useState(emptyData);

  useEffect(() => {
    void loadAutomationDashboard().then((result) => setData(result.data));
  }, []);

  const upcoming = useMemo(
    () =>
      data.scheduledPayments.find((payment) =>
        ["scheduled", "due", "failed", "retry_scheduled", "overdue"].includes(payment.status),
      ),
    [data.scheduledPayments],
  );
  const automation = upcoming
    ? data.automations.find((item) => item.id === upcoming.automation_id)
    : null;
  const activeAutoPay = data.automations.filter(
    (item) => item.automation_type === "circle_autopay" && item.status === "active",
  ).length;
  const activeAutoSave = data.automations.filter(
    (item) => item.automation_type === "piggy_autosave" && item.status === "active",
  ).length;

  return (
    <Link
      to="/automation"
      className="mt-5 block rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold">Upcoming Payment</p>
            <p className="text-[10px] font-semibold text-primary">View all</p>
          </div>
          {upcoming ? (
            <>
              <p className="mt-2 truncate text-sm font-semibold">
                {automation ? automationTargetName(automation, data.names) : "Scheduled payment"} ·{" "}
                {formatCurrency(Number(upcoming.amount), "GHS")}
              </p>
              <p className="mt-1 text-[11px] capitalize text-muted-foreground">
                {formatDate(upcoming.due_date)} · {upcoming.payment_type.replace("_", " ")}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No automatic deductions scheduled.</p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="AutoPay" value={String(activeAutoPay)} />
            <Metric label="AutoSave" value={String(activeAutoSave)} />
            <Metric
              label="Upcoming"
              value={String(
                data.scheduledPayments.filter(
                  (item) => item.status !== "successful" && item.status !== "cancelled",
                ).length,
              )}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-2">
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
