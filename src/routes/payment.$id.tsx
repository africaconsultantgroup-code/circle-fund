import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { CreditCard, Smartphone, Building2, Check, ShieldCheck } from "lucide-react";
import { getCircle, formatGHS, type Circle as CircleType } from "@/lib/mock-data";

export const Route = createFileRoute("/payment/$id")({
  loader: ({ params }) => {
    const c = getCircle(params.id);
    if (!c) throw notFound();
    return c;
  },
  component: PaymentPage,
});

const methods = [
  { id: "momo", label: "Mobile Money", sub: "MTN · 024 ••• 0142", icon: Smartphone },
  { id: "card", label: "Debit card", sub: "Visa •••• 4729", icon: CreditCard },
  { id: "bank", label: "Bank transfer", sub: "GCB Bank", icon: Building2 },
];

function PaymentPage() {
  const c = Route.useLoaderData() as CircleType;
  const navigate = useNavigate();
  const [method, setMethod] = useState("momo");
  const fee = 2;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Make payment" back="/circles" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="rounded-3xl bg-gradient-card p-5 text-primary-foreground shadow-elevated">
          <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Contributing to</p>
          <p className="mt-1 font-display text-lg font-semibold">{c.name}</p>
          <p className="mt-4 text-xs uppercase tracking-wide text-primary-foreground/60">Amount</p>
          <p className="font-display text-4xl font-bold">{formatGHS(c.amount)}</p>
          <p className="text-[11px] text-primary-foreground/70">{c.frequency} contribution · due {c.nextPayoutDate}</p>
        </div>

        <div>
          <p className="mb-2 font-display text-sm font-semibold">Payment method</p>
          <ul className="flex flex-col gap-2">
            {methods.map((m) => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <li key={m.id}>
                  <button
                    onClick={() => setMethod(m.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                      active ? "border-primary bg-secondary" : "border-border bg-card"
                    }`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-[11px] text-muted-foreground">{m.sub}</p>
                    </div>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {active && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <Row label="Contribution" value={formatGHS(c.amount)} />
          <Row label="Processing fee" value={formatGHS(fee)} />
          <div className="my-3 h-px bg-border" />
          <Row label="Total" value={formatGHS(c.amount + fee)} bold />
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 p-3 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Funds are held in an escrow until payout day. SikaCircle is regulated.
        </div>

        <button
          onClick={() => navigate({ to: "/payout/$id", params: { id: c.id } })}
          className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card"
        >
          Pay {formatGHS(c.amount + fee)}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={bold ? "font-display font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-display text-base font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}