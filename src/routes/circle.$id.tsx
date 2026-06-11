import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { SavingsPlanner } from "@/components/savings-planner";
import { Share2, Users, Calendar, CheckCircle2, Coins, UserCheck } from "lucide-react";
import { getCircle, formatGHS, type Circle as CircleType } from "@/lib/mock-data";
import { pendingApprovals } from "@/lib/mock-data";
import { getCircleById } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { toUserCircle } from "@/lib/user-circles";

export const Route = createFileRoute("/circle/$id")({
  loader: async ({ params }) => {
    const c = getCircle(params.id);
    if (c) return c;

    if (!isSupabaseConfigured) throw notFound();

    const { data, error } = await getCircleById(params.id);
    if (error || !data) throw notFound();

    const circle = toUserCircle(data);
    return {
      id: circle.id,
      name: circle.name,
      category: circle.category,
      inviteCode: circle.inviteToken ?? "Pending",
      amount: circle.amount,
      frequency: circle.frequency,
      currentCycle: circle.currentCycle,
      totalCycles: circle.totalCycles,
      nextRecipient: circle.nextRecipient,
      nextPayoutDate: circle.nextPayoutDate,
      members: Array.from({ length: circle.memberCount }, (_, index) => ({
        id: `${circle.id}-${index}`,
        name: index === 0 ? "You" : `Member ${index + 1}`,
        avatar: "",
        payoutPosition: index + 1,
        hasReceivedPayout: false,
      })),
    } as CircleType;
  },
  component: CircleDetails,
  notFoundComponent: () => (
    <div className="p-8 text-center text-sm text-muted-foreground">Circle not found.</div>
  ),
});

function CircleDetails() {
  const c = Route.useLoaderData() as CircleType;
  const pool = c.amount * c.members.length;
  const progress = (c.currentCycle / c.totalCycles) * 100;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader
        title={c.name}
        subtitle={`${c.members.length}/15 members`}
        back="/circles"
        right={<button className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><Share2 className="h-4 w-4" /></button>}
      />

      <div className="bg-gradient-card px-5 pt-5 pb-8 text-primary-foreground">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide">{c.category}</span>
          <span className="text-[10px] uppercase tracking-wide text-primary-foreground/70">Invite - {c.inviteCode}</span>
        </div>
        <p className="mt-4 text-xs uppercase tracking-wide text-primary-foreground/60">Pool per cycle</p>
        <p className="mt-1 font-display text-3xl font-bold">{formatGHS(pool)}</p>
        <p className="text-xs text-primary-foreground/70">{formatGHS(c.amount)} from each member - {c.frequency}</p>

        <div className="mt-5">
          <div className="flex justify-between text-[11px] text-primary-foreground/70">
            <span>Cycle {c.currentCycle} of {c.totalCycles}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pt-5">
        <Link to="/payment/$id" params={{ id: c.id }} className="flex flex-col items-start gap-1.5 rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-card">
          <Coins className="h-5 w-5" />
          <p className="font-display text-sm font-semibold">Contribute</p>
          <p className="text-[11px] text-primary-foreground/70">Due {c.nextPayoutDate}</p>
        </Link>
        <Link to="/payout/$id" params={{ id: c.id }} className="flex flex-col items-start gap-1.5 rounded-2xl border border-border bg-card p-4 shadow-card">
          <Calendar className="h-5 w-5 text-primary" />
          <p className="font-display text-sm font-semibold">Payout schedule</p>
          <p className="text-[11px] text-muted-foreground">Next: {c.nextRecipient}</p>
        </Link>
      </div>

      <div className="px-5 pt-3">
        <Link to="/circle/$id/approvals" params={{ id: c.id }} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-card">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-[color:var(--gold-foreground)]">
            <UserCheck className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold">Pending approvals</p>
            <p className="text-[11px] text-muted-foreground">{pendingApprovals.length} members awaiting - review verification</p>
          </div>
          <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">{pendingApprovals.length}</span>
        </Link>
      </div>

      <SavingsPlanner defaultTargetAmount={c.amount} defaultDueDate={toDateInputValue(c.nextPayoutDate)} />

      <section className="px-5 pt-7">
        <h2 className="font-display text-base font-semibold">Payout timeline</h2>
        <ol className="mt-4 flex flex-col gap-0">
          {c.members.slice(0, 6).map((m, i) => {
            const done = m.hasReceivedPayout;
            const isNext = i === c.currentCycle;
            return (
              <li key={m.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                    done ? "bg-success text-success-foreground" :
                    isNext ? "bg-gradient-gold text-gold-foreground ring-4 ring-gold/20" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  {i < 5 && <div className={`my-1 w-0.5 flex-1 ${done ? "bg-success/40" : "bg-border"}`} style={{ minHeight: 28 }} />}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{m.name}</p>
                    {isNext && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--gold-foreground)]">Next</span>}
                    {done && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Paid</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{formatGHS(pool)} - Position {m.payoutPosition}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="px-5 pt-3 pb-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Members</h2>
          <Link to="/circle/$id/members" params={{ id: c.id }} className="flex items-center gap-1 text-xs font-medium text-primary">
            <Users className="h-3.5 w-3.5" /> View all
          </Link>
        </div>
        <div className="mt-3 flex -space-x-2">
          {c.members.slice(0, 8).map((m) => (
            <img key={m.id} src={m.avatar} alt="" className="h-10 w-10 rounded-full border-2 border-background bg-secondary" />
          ))}
          {c.members.length > 8 && (
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold">
              +{c.members.length - 8}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function toDateInputValue(value: string | undefined) {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString().slice(0, 10);
}
