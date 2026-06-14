import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SavingsPlanner } from "@/components/savings-planner";
import { Calendar, Check, Loader2, Settings, Share2, ShieldAlert, UserCheck, Users, WalletCards, X } from "lucide-react";
import { getCircle, type Circle as MockCircleType } from "@/lib/mock-data";
import {
  getCircleById,
  getCircleMembership,
  listCircleContributions,
  listCircleMembers,
  manageCircleMember,
  type Circle,
  type CircleContributionStatus,
  type CircleMemberDetails,
} from "@/lib/db";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireAuth } from "@/lib/phone-guard";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

export const Route = createFileRoute("/circle/$id")({
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
    if (!isSupabaseConfigured) {
      const c = getCircle(params.id);
      if (!c) throw notFound();
      return { circleId: params.id, mockCircle: c };
    }

    return { circleId: params.id, mockCircle: null };
  },
  component: CircleDetails,
  notFoundComponent: () => (
    <div className="p-8 text-center text-sm text-muted-foreground">Circle not found.</div>
  ),
});

type Tab = "overview" | "members" | "contributions" | "settings";

function CircleDetails() {
  const { circleId, mockCircle } = Route.useLoaderData() as { circleId: string; mockCircle: MockCircleType | null };
  const [tab, setTab] = useState<Tab>("overview");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMemberDetails[]>([]);
  const [contributions, setContributions] = useState<CircleContributionStatus[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentMember = useMemo(() => members.find((member) => member.user_id === user?.id), [members, user?.id]);
  const isAdmin = Boolean(circle?.owner_id === user?.id || (currentMember?.status === "approved" && ["creator", "admin"].includes(currentMember.role)));
  const approvedMembers = members.filter((member) => member.status === "approved");
  const pendingMembers = members.filter((member) => member.status === "pending");
  const rejectedMembers = members.filter((member) => member.status === "rejected" || member.status === "removed");
  const currency = (circle?.base_currency ?? mockCircle?.baseCurrency ?? "GHS") as CurrencyCode;
  const amount = Number(circle?.contribution_amount ?? mockCircle?.amount ?? 0);
  const maxMembers = Math.min(circle?.max_members ?? 15, 15);

  useEffect(() => {
    void loadCircle();
  }, [circleId]);

  if (mockCircle) {
    return <MockCircleDetails circle={mockCircle} />;
  }

  async function loadCircle() {
    setIsLoading(true);
    setError("");

    const currentUser = await getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      setError("Please sign in to view this circle.");
      setIsLoading(false);
      return;
    }

    const [circleResult, membershipResult, membersResult, contributionResult] = await Promise.all([
      getCircleById(circleId),
      getCircleMembership(circleId, currentUser.id),
      listCircleMembers(circleId),
      listCircleContributions(circleId),
    ]);

    if (circleResult.error || !circleResult.data) {
      setError("Circle not found or you do not have access.");
      setIsLoading(false);
      return;
    }

    setCircle(circleResult.data);
    setMembershipStatus(membershipResult.data?.status ?? (circleResult.data.owner_id === currentUser.id ? "approved" : null));
    setMembers((membersResult.data ?? []) as CircleMemberDetails[]);
    setContributions((contributionResult.data ?? []) as CircleContributionStatus[]);
    setIsLoading(false);
  }

  async function handleMemberAction(member: CircleMemberDetails, action: "approve" | "reject" | "remove") {
    setMessage("");
    setError("");
    const { error: actionError } = await manageCircleMember(member.membership_id, action);
    if (actionError) {
      setError(actionError.message);
      return;
    }

    setMessage(action === "approve" ? "Member approved." : action === "reject" ? "Member rejected." : "Member removed.");
    await loadCircle();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader
        title={circle?.name ?? "Circle"}
        subtitle={`${approvedMembers.length}/${maxMembers} approved members`}
        back="/circles"
        right={<button className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><Share2 className="h-4 w-4" /></button>}
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading circle
        </div>
      ) : error ? (
        <div className="m-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      ) : circle ? (
        <>
          <section className="bg-gradient-card px-5 pt-5 pb-7 text-primary-foreground">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide">{circle.status}</span>
              <span className="text-[10px] uppercase tracking-wide text-primary-foreground/70">Invite - {circle.invite_code ?? circle.invite_token}</span>
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-primary-foreground/60">Contribution</p>
            <p className="mt-1 font-display text-3xl font-bold">{formatCurrency(amount, currency)}</p>
            <p className="text-xs text-primary-foreground/70">{circle.frequency ?? "monthly"} - starts {formatDate(circle.start_date)}</p>
          </section>

          {membershipStatus === "pending" && (
            <Notice tone="gold" text="Waiting for admin approval. You will see the approved member list after your request is approved." />
          )}
          {membershipStatus === "rejected" && (
            <Notice tone="danger" text="Your request was not approved." />
          )}
          {membershipStatus === "removed" && (
            <Notice tone="danger" text="You have been removed from this circle." />
          )}
          {message && <Notice tone="success" text={message} />}

          <div className="grid grid-cols-4 gap-2 px-5 pt-4">
            <TabButton active={tab === "overview"} icon={<WalletCards className="h-4 w-4" />} label="Overview" onClick={() => setTab("overview")} />
            <TabButton active={tab === "members"} icon={<Users className="h-4 w-4" />} label="Members" onClick={() => setTab("members")} />
            <TabButton active={tab === "contributions"} icon={<Calendar className="h-4 w-4" />} label="Contrib." onClick={() => setTab("contributions")} />
            <TabButton active={tab === "settings"} icon={<Settings className="h-4 w-4" />} label="Settings" onClick={() => setTab("settings")} />
          </div>

          {tab === "overview" && (
            <section className="px-5 pt-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Approved" value={`${approvedMembers.length}/${maxMembers}`} />
                <Metric label="Pending" value={String(pendingMembers.length)} />
                <Metric label="Frequency" value={circle.frequency ?? "Monthly"} />
                <Metric label="Start date" value={formatDate(circle.start_date)} />
              </div>
              <SavingsPlanner defaultTargetAmount={amount} defaultDueDate={toDateInputValue(circle.start_date)} currency={currency} />
            </section>
          )}

          {tab === "members" && (
            <section className="flex flex-col gap-4 p-5">
              {isAdmin && pendingMembers.length > 0 && (
                <MemberGroup title="Pending members" members={pendingMembers} isAdmin={isAdmin} onAction={handleMemberAction} />
              )}
              {membershipStatus === "approved" || isAdmin ? (
                <MemberGroup title="Approved members" members={approvedMembers} isAdmin={isAdmin} onAction={handleMemberAction} />
              ) : (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
                  {membershipStatus === "pending" ? "Waiting for admin approval." : "Approved members are visible after approval."}
                </div>
              )}
              {isAdmin && rejectedMembers.length > 0 && (
                <MemberGroup title="Rejected/removed" members={rejectedMembers} isAdmin={isAdmin} onAction={handleMemberAction} />
              )}
            </section>
          )}

          {tab === "contributions" && (
            <section className="p-5">
              {contributions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
                  No contribution records yet.
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {contributions.map((contribution) => (
                    <li key={contribution.contribution_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{contribution.full_name ?? "Member"}</p>
                        <StatusPill status={contribution.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Expected {formatCurrency(Number(contribution.expected_amount ?? amount), currency)} - due {formatDate(contribution.due_date)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Paid at {formatDate(contribution.paid_at)} - ref {contribution.payment_reference ?? "none"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "settings" && (
            <section className="p-5">
              <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
                Circle settings and payment controls will be added later. Payments, payouts, wallets, and contribution collection are not active yet.
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function MemberGroup({
  title,
  members,
  isAdmin,
  onAction,
}: {
  title: string;
  members: CircleMemberDetails[];
  isAdmin: boolean;
  onAction: (member: CircleMemberDetails, action: "approve" | "reject" | "remove") => void;
}) {
  return (
    <div>
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {members.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">No members in this section.</div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.membership_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{member.full_name ?? "Member"}</p>
                    <StatusPill status={member.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{member.phone ?? "No phone"} - {member.country ?? "No country"} - {member.preferred_currency ?? "GHS"}</p>
                  <p className="text-[11px] text-muted-foreground">Joined {formatDate(member.joined_at)} - {member.role}</p>
                </div>
              </div>
              {isAdmin && member.role !== "creator" && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {member.status === "pending" && (
                    <>
                      <button onClick={() => onAction(member, "approve")} className="flex items-center justify-center gap-1 rounded-xl bg-success/10 py-2 text-[11px] font-semibold text-success">
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button onClick={() => onAction(member, "reject")} className="flex items-center justify-center gap-1 rounded-xl bg-destructive/10 py-2 text-[11px] font-semibold text-destructive">
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {member.status === "approved" && (
                    <button onClick={() => onAction(member, "remove")} className="col-span-3 flex items-center justify-center gap-1 rounded-xl bg-destructive/10 py-2 text-[11px] font-semibold text-destructive">
                      <X className="h-3.5 w-3.5" /> Remove member
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MockCircleDetails({ circle }: { circle: MockCircleType }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title={circle.name} subtitle={`${circle.members.length}/15 members`} back="/circles" />
      <div className="p-5">
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
          Live member management is available when Supabase is configured.
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-semibold ${active ? "border-primary bg-secondary text-primary" : "border-border bg-card text-muted-foreground"}`}>
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}

function Notice({ text, tone }: { text: string; tone: "gold" | "danger" | "success" }) {
  const classes = tone === "danger"
    ? "border-destructive/30 bg-destructive/5 text-destructive"
    : tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : "border-gold/40 bg-gold/10 text-[color:var(--gold-foreground)]";

  return (
    <div className={`mx-5 mt-4 flex items-center gap-2 rounded-2xl border px-4 py-3 ${classes}`}>
      <ShieldAlert className="h-4 w-4" />
      <p className="text-[11px] font-medium">{text}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const good = status === "approved" || status === "paid" || status === "processed";
  const danger = status === "rejected" || status === "removed" || status === "late" || status === "overdue" || status === "failed";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${good ? "bg-success/10 text-success" : danger ? "bg-destructive/10 text-destructive" : "bg-gold/15 text-[color:var(--gold-foreground)]"}`}>
      {status}
    </span>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}
