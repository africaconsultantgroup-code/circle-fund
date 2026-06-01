import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Users, Repeat, Calendar, FileText, ShieldCheck, ShieldAlert } from "lucide-react";
import { isFullyVerified, verification, trustScore } from "@/lib/mock-data";

export const Route = createFileRoute("/create-circle")({
  component: CreateCirclePage,
});

function CreateCirclePage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState(8);
  const [amount, setAmount] = useState(250);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");
  const verified = isFullyVerified(verification);
  const overValue = amount * members > trustScore.maxCircleValue;
  const atCircleLimit = trustScore.activeCircles >= trustScore.maxCircles;
  const blocked = !verified || overValue || atCircleLimit;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Create Circle" subtitle="Set up a new susu" back="/circles" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        {!verified && (
          <Link to="/verify" className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">Verification required</p>
              <p className="text-[11px] opacity-80">Complete KYC to create a circle.</p>
            </div>
          </Link>
        )}
        {verified && overValue && (
          <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[color:var(--gold-foreground)]">
            <ShieldAlert className="h-5 w-5" />
            <p className="text-[11px] font-medium">Pool exceeds your trust limit. Increase your score to unlock higher-value circles.</p>
          </div>
        )}
        {verified && atCircleLimit && (
          <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[color:var(--gold-foreground)]">
            <ShieldAlert className="h-5 w-5" />
            <p className="text-[11px] font-medium">You're at your active circles limit ({trustScore.maxCircles}). Finish a circle to create a new one.</p>
          </div>
        )}
        {verified && (
          <div className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-success">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-[11px] font-medium">You are verified · trust score {trustScore.score}</p>
          </div>
        )}

        <Section icon={<FileText className="h-4 w-4" />} title="Circle info">
          <Input label="Circle name" placeholder="e.g. Family Savers" defaultValue="My New Circle" />
          <Input label="Description" placeholder="Why this circle exists" defaultValue="Monthly contributions with close friends." />
          <Select label="Category" options={["Family", "Friends", "Work", "Church", "Association"]} />
        </Section>

        <Section icon={<Repeat className="h-4 w-4" />} title="Contribution">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount (GHS)</label>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
              <span className="text-sm font-semibold text-muted-foreground">GHS</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Frequency</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["daily", "weekly", "monthly"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-medium capitalize transition-colors ${
                    frequency === f ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border bg-card text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={<Users className="h-4 w-4" />} title="Members">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Maximum members</label>
              <span className="font-display text-sm font-semibold">{members} / 15</span>
            </div>
            <input
              type="range"
              min={2}
              max={15}
              value={members}
              onChange={(e) => setMembers(Number(e.target.value))}
              className="mt-3 w-full accent-[color:var(--primary)]"
            />
          </div>
        </Section>

        <Section icon={<Calendar className="h-4 w-4" />} title="Start date">
          <Input label="First contribution" type="date" defaultValue="2026-06-15" />
        </Section>

        <div className="rounded-3xl bg-secondary p-4">
          <p className="text-xs uppercase tracking-wide text-primary">Estimated pool per cycle</p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">GHS {(amount * members).toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">Each member receives one payout over {members} {frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : "months"}.</p>
        </div>

        <button
          disabled={blocked}
          onClick={() => navigate({ to: "/circle/$id", params: { id: "family-savers" } })}
          className="mt-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50"
        >
          {blocked ? "Locked" : "Create Circle"}
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary">{icon}</span>
        <p className="font-display text-sm font-semibold">{title}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Input({ label, type = "text", placeholder, defaultValue }: { label: string; type?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select className="mt-1.5 w-full appearance-none rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}