import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Crown, UserPlus, CheckCircle2 } from "lucide-react";
import { getCircle, type Circle as CircleType } from "@/lib/mock-data";

export const Route = createFileRoute("/circle/$id/members")({
  loader: ({ params }) => {
    const c = getCircle(params.id);
    if (!c) throw notFound();
    return c;
  },
  component: MembersPage,
});

function MembersPage() {
  const c = Route.useLoaderData() as CircleType;
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader
        title="Members"
        subtitle={`${c.members.length} / 15`}
        back="/circles"
        right={<button className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground"><UserPlus className="h-4 w-4" /></button>}
      />
      <ul className="flex flex-col gap-2 p-5">
        {c.members.map((m, i) => (
          <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
            <img src={m.avatar} alt="" className="h-12 w-12 rounded-2xl bg-secondary" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">{m.name}</p>
                {i === 0 && <Crown className="h-3.5 w-3.5 text-gold" />}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Position {m.payoutPosition} · {m.hasReceivedPayout ? "Received payout" : m.hasPaidThisCycle ? "Paid this cycle" : "Pending"}
              </p>
            </div>
            {m.hasPaidThisCycle && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}