import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ArrowDownLeft, ArrowUpRight, Filter } from "lucide-react";
import { transactions, formatGHS } from "@/lib/mock-data";
import { StatusIcon } from "./_app/payments";

export const Route = createFileRoute("/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const groups = transactions.reduce<Record<string, typeof transactions>>((acc, t) => {
    (acc[t.date.split(",")[0].split(" ").slice(0, 1).join(" ") + " " + t.date.split(",")[1].trim()] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader
        title="Transactions"
        back="/profile"
        right={<button className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><Filter className="h-4 w-4" /></button>}
      />
      <div className="p-5">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-1.5 text-xs font-medium">
          {["All", "Contributions", "Payouts"].map((t, i) => (
            <button key={t} className={`rounded-xl py-2 ${i === 0 ? "bg-card shadow-card text-primary" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-5">
          {Object.entries(groups).map(([date, items]) => (
            <div key={date}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{date}</p>
              <ul className="flex flex-col gap-2">
                {items.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.type === "payout" ? "bg-gold/15 text-[color:var(--gold-foreground)]" : "bg-secondary text-primary"}`}>
                      {t.type === "payout" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{t.circleName}</p>
                      <p className="flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
                        <StatusIcon status={t.status} /> {t.type} · {t.status}
                      </p>
                    </div>
                    <p className={`font-display text-sm font-semibold ${t.type === "payout" ? "text-success" : ""}`}>
                      {t.type === "payout" ? "+" : "-"}{formatGHS(t.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}