import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { circles, formatGHS, transactions } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const upcoming = circles.map((c) => ({ circle: c }));

  return (
    <div className="flex flex-col px-5 pt-12">
      <h1 className="font-display text-2xl font-bold tracking-tight">Payments</h1>
      <p className="text-xs text-muted-foreground">Track contributions and payouts</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contributed</p>
          <p className="mt-1 font-display text-lg font-bold">{formatGHS(2850)}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-success"><ArrowUpRight className="h-3 w-3" /> This month</p>
        </div>
        <div className="rounded-2xl bg-gradient-gold p-4 shadow-card">
          <p className="text-[11px] uppercase tracking-wide text-gold-foreground/80">Received</p>
          <p className="mt-1 font-display text-lg font-bold text-gold-foreground">{formatGHS(4000)}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-gold-foreground/80"><ArrowDownLeft className="h-3 w-3" /> Last payout</p>
        </div>
      </div>

      <h2 className="mt-7 font-display text-base font-semibold">Upcoming contributions</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {upcoming.slice(0, 3).map(({ circle }) => (
          <li key={circle.id}>
            <Link
              to="/payment/$id"
              params={{ id: circle.id }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary font-display font-semibold">
                {circle.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-display text-sm font-semibold">{circle.name}</p>
                <p className="text-[11px] text-muted-foreground">Due {circle.nextPayoutDate}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-sm font-semibold">{formatGHS(circle.amount)}</p>
                <p className="text-[11px] text-primary">Pay now →</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-7 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold">Recent activity</h2>
        <Link to="/transactions" className="text-xs font-medium text-primary">View all</Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {transactions.slice(0, 5).map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.type === "payout" ? "bg-gold/15 text-[color:var(--gold-foreground)]" : "bg-secondary text-primary"}`}>
              {t.type === "payout" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{t.circleName}</p>
              <p className="text-[11px] text-muted-foreground">{t.type === "payout" ? "Payout received" : "Contribution"} · {t.date}</p>
            </div>
            <div className="text-right">
              <p className={`font-display text-sm font-semibold ${t.type === "payout" ? "text-success" : ""}`}>
                {t.type === "payout" ? "+" : "-"}{formatGHS(t.amount)}
              </p>
              <p className="flex items-center justify-end gap-1 text-[10px] capitalize text-muted-foreground">
                <StatusIcon status={t.status} /> {t.status}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusIcon({ status }: { status: "completed" | "pending" | "failed" }) {
  if (status === "completed") return <CheckCircle2 className="h-3 w-3 text-success" />;
  if (status === "pending") return <Clock className="h-3 w-3 text-[color:var(--gold-foreground)]" />;
  return <XCircle className="h-3 w-3 text-destructive" />;
}