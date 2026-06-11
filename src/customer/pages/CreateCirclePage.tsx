import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Users, Repeat, Calendar, FileText, ShieldCheck, ShieldAlert, CheckCircle2, Loader2, Copy } from "lucide-react";
import { createCircleWithCreator, generateInviteToken } from "@/lib/db";
import { trustScore } from "@/lib/mock-data";
import { getCircleEligibility, type CircleEligibility } from "@/lib/onboarding";

export function CreateCirclePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("My New Circle");
  const [description, setDescription] = useState("Monthly contributions with close friends.");
  const [category, setCategory] = useState("Family");
  const [members, setMembers] = useState(8);
  const [amount, setAmount] = useState(150);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [startDate, setStartDate] = useState("2026-06-15");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [eligibility, setEligibility] = useState<CircleEligibility | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);
  const eligible = Boolean(eligibility?.isEligible);
  const overValue = amount * members > trustScore.maxCircleValue;
  const atCircleLimit = trustScore.activeCircles >= trustScore.maxCircles;
  const blocked = isCheckingEligibility || !eligible || overValue || atCircleLimit;

  useEffect(() => {
    let isMounted = true;

    getCircleEligibility().then((result) => {
      if (!isMounted) return;
      setEligibility(result);
      setIsCheckingEligibility(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const allowedFrequencies = ["weekly", "biweekly", "monthly"];

    if (!name.trim()) nextErrors.name = "Enter a circle name.";
    if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = "Enter a contribution amount greater than 0.";
    if (!allowedFrequencies.includes(frequency)) nextErrors.frequency = "Choose weekly, biweekly, or monthly.";
    if (!Number.isInteger(members) || members < 2 || members > 15) nextErrors.members = "Maximum members must be between 2 and 15.";
    if (!startDate) nextErrors.startDate = "Choose a start date.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreateCircle = async () => {
    setSubmitError("");
    setSuccess("");
    setInviteLink("");

    if (blocked || !validate()) return;

    setIsSaving(true);
    try {
      const currentEligibility = eligibility ?? await getCircleEligibility();
      if (!currentEligibility.isEligible || !currentEligibility.userId) {
        setEligibility(currentEligibility);
        setSubmitError(currentEligibility.message || "Complete verification before creating a circle.");
        return;
      }

      const inviteToken = generateInviteToken();
      const { data, error } = await createCircleWithCreator(
        {
          owner_id: currentEligibility.userId,
          name: name.trim(),
          description: description.trim() ? `${description.trim()} Category: ${category}` : `Category: ${category}`,
          contribution_amount: amount,
          goal_amount: amount * members,
          frequency,
          max_members: members,
          invite_token: inviteToken,
          start_date: new Date(`${startDate}T00:00:00`).toISOString(),
          status: "active",
        },
        currentEligibility.userId,
      );

      if (error || !data) {
        setSubmitError(error?.message ?? "We could not create this circle. Please try again.");
        return;
      }

      const link = `${window.location.origin}/join-circle?code=${encodeURIComponent(data.invite_token)}`;
      setInviteLink(link);
      setSuccess("Circle created successfully. You have been added as admin/creator.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We could not create this circle. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Create Circle" subtitle="Set up a new susu" back="/circles" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        {isCheckingEligibility && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-muted-foreground shadow-card">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-[11px] font-medium">Checking verification eligibility...</p>
          </div>
        )}
        {!isCheckingEligibility && !eligible && (
          <Link to={eligibility?.issues[0]?.to ?? "/verify"} className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">Verification required</p>
              <p className="text-[11px] opacity-80">{eligibility?.issues[0]?.message ?? "Complete verification to create a circle."}</p>
              <p className="mt-1 text-[11px] font-semibold">{eligibility?.issues[0]?.actionLabel ?? "Complete verification"}</p>
            </div>
          </Link>
        )}
        {eligible && overValue && (
          <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[color:var(--gold-foreground)]">
            <ShieldAlert className="h-5 w-5" />
            <p className="text-[11px] font-medium">Pool exceeds your trust limit. Increase your score to unlock higher-value circles.</p>
          </div>
        )}
        {eligible && atCircleLimit && (
          <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-[color:var(--gold-foreground)]">
            <ShieldAlert className="h-5 w-5" />
            <p className="text-[11px] font-medium">You're at your active circles limit ({trustScore.maxCircles}). Finish a circle to create a new one.</p>
          </div>
        )}
        {eligible && (
          <div className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-success">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-[11px] font-medium">Verification complete - trust score {trustScore.score}</p>
          </div>
        )}

        <Section icon={<FileText className="h-4 w-4" />} title="Circle info">
          <Input label="Circle name" placeholder="e.g. Family Savers" value={name} onChange={setName} error={errors.name} />
          <Input label="Description" placeholder="Why this circle exists" value={description} onChange={setDescription} />
          <Select label="Category" options={["Family", "Friends", "Work", "Church", "Association"]} value={category} onChange={setCategory} />
        </Section>

        <Section icon={<Repeat className="h-4 w-4" />} title="Contribution">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount (GHS)</label>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
              <span className="text-sm font-semibold text-muted-foreground">GHS</span>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            {errors.amount && <p className="mt-1 text-[11px] font-medium text-destructive">{errors.amount}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Frequency</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["weekly", "biweekly", "monthly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`rounded-2xl border px-3 py-3 text-sm font-medium capitalize transition-colors ${
                    frequency === f ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border bg-card text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {errors.frequency && <p className="mt-1 text-[11px] font-medium text-destructive">{errors.frequency}</p>}
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
            {errors.members && <p className="mt-1 text-[11px] font-medium text-destructive">{errors.members}</p>}
          </div>
        </Section>

        <Section icon={<Calendar className="h-4 w-4" />} title="Start date">
          <Input label="First contribution" type="date" value={startDate} onChange={setStartDate} error={errors.startDate} />
        </Section>

        <div className="rounded-3xl bg-secondary p-4">
          <p className="text-xs uppercase tracking-wide text-primary">Estimated pool per cycle</p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">GHS {(amount * members).toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground">Each member receives one payout over {members} {frequency === "weekly" ? "weeks" : frequency === "biweekly" ? "fortnights" : "months"}.</p>
        </div>

        {success && (
          <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-success">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-[11px] font-medium">{success}</p>
            </div>
            {inviteLink && (
              <div className="mt-3 rounded-xl bg-background/70 p-3 text-foreground">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Invite link</p>
                <p className="mt-1 break-all font-mono text-[11px]">{inviteLink}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(inviteLink)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-[11px] font-semibold text-primary"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/circles" })}
                    className="rounded-xl bg-gradient-primary py-2 text-[11px] font-semibold text-primary-foreground"
                  >
                    View circles
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {submitError && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{submitError}</p>
          </div>
        )}

        <button
          disabled={blocked || isSaving}
          onClick={handleCreateCircle}
          className="mt-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50"
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving
            </span>
          ) : blocked ? "Locked" : "Create Circle"}
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

function Input({ label, type = "text", placeholder, value, onChange, error }: { label: string; type?: string; placeholder?: string; value: string; onChange: (value: string) => void; error?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      {error && <p className="mt-1 text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

function Select({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full appearance-none rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
