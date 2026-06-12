import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { CheckCircle2, Sparkles, Calendar, Share2 } from "lucide-react";
import { getCircle, formatGHS, type Circle as CircleType } from "@/lib/mock-data";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/payout/$id")({
  beforeLoad: requireVerifiedPhone,
  loader: ({ params }) => {
    const c = getCircle(params.id);
    if (!c) throw notFound();
    return c;
  },
  component: PayoutPage,
});

function PayoutPage() {
  const c = Route.useLoaderData() as CircleType;
  const pool = c.amount * c.members.length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Payout schedule" back="/circles" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="overflow-hidden rounded-3xl bg-gradient-card p-6 text-primary-foreground shadow-elevated">
          <div className="flex items-center gap-2 text-xs text-gold">
            <Sparkles className="h-4 w-4" /> Next payout
          </div>
          <p className="mt-3 font-display text-4xl font-bold">{formatGHS(pool)}</p>
          <p className="mt-1 text-sm text-primary-foreground/80">Goes to <span className="font-semibold">{c.nextRecipient}</span></p>
          <div className="mt-5 flex items-center gap-2 text-xs text-primary-foreground/70">
            <Calendar className="h-4 w-4" /> {c.nextPayoutDate} · {c.frequency} cycle
          </div>
        </div>

        <div>
          <p className="font-display text-sm font-semibold">Full payout timeline</p>
          <ol className="mt-4 flex flex-col gap-0">
            {c.members.map((m, i) => {
              const done = m.hasReceivedPayout;
              const isNext = i === c.currentCycle;
              const last = i === c.members.length - 1;
              return (
                <li key={m.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-success text-success-foreground" :
                      isNext ? "bg-gradient-gold text-gold-foreground ring-4 ring-gold/20" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                    </div>
                    {!last && <div className={`my-1 w-0.5 flex-1 ${done ? "bg-success/40" : "bg-border"}`} style={{ minHeight: 32 }} />}
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-3 pb-5">
                    <div className="flex items-center gap-2">
                      <img src={m.avatar} className="h-9 w-9 rounded-xl bg-secondary" alt="" />
                      <div>
                        <p className="text-sm font-semibold">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">Cycle {i + 1} · {formatGHS(pool)}</p>
                      </div>
                    </div>
                    {done && <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-semibold text-success">Paid</span>}
                    {isNext && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-semibold text-[color:var(--gold-foreground)]">Next</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex gap-3">
          <Link to="/circle/$id" params={{ id: c.id }} className="flex-1 rounded-2xl border border-border bg-card py-3.5 text-center font-display text-sm font-semibold">
            Back to circle
          </Link>
          <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground">
            <Share2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
