import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SavingsPlanner } from "@/components/savings-planner";
import { Activity, Calendar, Check, HeartPulse, Loader2, LockKeyhole, RefreshCw, Settings, Share2, ShieldAlert, ShieldCheck, Shuffle, TrendingUp, Users, WalletCards, X } from "lucide-react";
import { getCircle, type Circle as MockCircleType } from "@/lib/mock-data";
import {
  generateCircleContributionSchedule,
  generateCirclePayoutRotation,
  getCircleById,
  getCircleMembership,
  getCirclePaymentSummary,
  listCirclePayoutRotation,
  listCircleContributions,
  listCircleMembers,
  lockCirclePayoutRotation,
  manageCircleMember,
  type Circle,
  type CircleContributionStatus,
  type CircleMemberDetails,
  type CirclePaymentSummary,
  type PayoutRotationItem,
} from "@/lib/db";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireAuth } from "@/lib/phone-guard";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";
import { payContributionFromWallet } from "@/lib/wallet";

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

type Tab = "overview" | "members" | "contributions" | "rotation" | "settings";

function CircleDetails() {
  const { circleId, mockCircle } = Route.useLoaderData() as { circleId: string; mockCircle: MockCircleType | null };
  return <CircleDetailsContent circleId={circleId} mockCircle={mockCircle} />;
}

export function CircleDetailsContent({ circleId, mockCircle }: { circleId: string; mockCircle: MockCircleType | null }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMemberDetails[]>([]);
  const [contributions, setContributions] = useState<CircleContributionStatus[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<CirclePaymentSummary | null>(null);
  const [payoutRotation, setPayoutRotation] = useState<PayoutRotationItem[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [isUpdatingRotation, setIsUpdatingRotation] = useState(false);
  const [initiatingPaymentId, setInitiatingPaymentId] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState("");
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
  const myPayoutTurn = useMemo(() => payoutRotation.find((item) => item.is_current_user), [payoutRotation]);
  const rotationLocked = payoutRotation.some((item) => Boolean(item.locked_at));
  const rotationLockedAt = payoutRotation.find((item) => item.locked_at)?.locked_at ?? null;
  const canChangeRotation = isAdmin && !rotationLocked && !hasCircleStarted(circle?.start_date);
  const rotationByMember = useMemo(() => new Map(payoutRotation.map((turn) => [turn.member_id, turn])), [payoutRotation]);
  const contributionSummary = useMemo(() => {
    if (paymentSummary) {
      return {
        totalExpected: Number(paymentSummary.total_expected ?? 0),
        totalPaid: Number(paymentSummary.total_paid ?? 0),
        outstanding: Number(paymentSummary.pending_amount ?? 0) + Number(paymentSummary.overdue_amount ?? 0) + Number(paymentSummary.failed_amount ?? 0),
        overdue: Number(paymentSummary.overdue_amount ?? 0),
      };
    }

    const totalExpected = contributions.reduce((sum, contribution) => sum + Number(contribution.expected_amount ?? 0), 0);
    const totalPaid = contributions
      .filter((contribution) => contribution.status === "paid")
      .reduce((sum, contribution) => sum + Number(contribution.expected_amount ?? 0), 0);
    const overdue = contributions
      .filter((contribution) => contribution.status === "overdue")
      .reduce((sum, contribution) => sum + Number(contribution.expected_amount ?? 0), 0);

    return {
      totalExpected,
      totalPaid,
      outstanding: Math.max(totalExpected - totalPaid, 0),
      overdue,
    };
  }, [contributions, paymentSummary]);
  const cycleHealth = useMemo(() => buildCircleHealth(contributions, approvedMembers.length, amount, paymentSummary), [contributions, approvedMembers.length, amount, paymentSummary]);
  const trustSummary = useMemo(() => buildTrustSummary(contributions, circle?.status, user?.id), [contributions, circle?.status, user?.id]);
  const activityLog = useMemo(() => buildActivityLog(currentMember, contributions, payoutRotation), [currentMember, contributions, payoutRotation]);

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

    const [circleResult, membershipResult, membersResult, contributionResult, rotationResult, paymentSummaryResult] = await Promise.all([
      getCircleById(circleId),
      getCircleMembership(circleId, currentUser.id),
      listCircleMembers(circleId),
      listCircleContributions(circleId),
      listCirclePayoutRotation(circleId),
      getCirclePaymentSummary(circleId),
    ]);

    if (circleResult.error || !circleResult.data) {
      setError("Circle not found or you do not have access.");
      setIsLoading(false);
      return;
    }

    setCircle(circleResult.data);
    const resolvedMembershipStatus = membershipResult.data?.status ?? (circleResult.data.owner_id === currentUser.id ? "approved" : null);
    if (resolvedMembershipStatus !== "approved") {
      setCircle(circleResult.data);
      setMembershipStatus(resolvedMembershipStatus);
      setError(resolvedMembershipStatus === "pending"
        ? "Your join request is pending approval. Circle details are available after approval."
        : resolvedMembershipStatus === "pending_capacity_review"
          ? "Pending SikaCircle review. Circle details are available after your capacity review and member approval."
        : resolvedMembershipStatus === "rejected" || resolvedMembershipStatus === "removed"
          ? "You do not have access to this circle."
          : "Only approved members can view circle details.");
      setIsLoading(false);
      return;
    }

    setMembershipStatus(resolvedMembershipStatus);
    setMembers((membersResult.data ?? []) as CircleMemberDetails[]);
    setContributions((contributionResult.data ?? []) as CircleContributionStatus[]);
    setPayoutRotation((rotationResult.data ?? []) as PayoutRotationItem[]);
    setPaymentSummary(paymentSummaryResult.data);
    console.log("payout_rotation_fetch_debug", {
      circle_id: circleId,
      user_id: currentUser.id,
      member_role: membershipResult.data?.role ?? (circleResult.data.owner_id === currentUser.id ? "owner" : null),
      member_status: membershipResult.data?.status ?? (circleResult.data.owner_id === currentUser.id ? "approved" : null),
      payout_schedule_rows_found: rotationResult.data?.length ?? 0,
      payout_schedule_query_error: rotationResult.error?.message ?? null,
      payout_schedule_rows: rotationResult.data ?? [],
    });
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

  async function handleGenerateSchedule() {
    setMessage("");
    setError("");
    setIsGeneratingSchedule(true);
    const { data, error: scheduleError } = await generateCircleContributionSchedule(circleId, 1);
    setIsGeneratingSchedule(false);

    if (scheduleError) {
      setError(scheduleError.message);
      return;
    }

    setMessage(Number(data ?? 0) > 0 ? "Contribution schedule generated." : "Contribution schedule is already up to date.");
    await loadCircle();
  }

  async function handlePayContributionFromWallet(contribution: CircleContributionStatus) {
    setMessage("");
    setError("");
    setPaymentNotice("");
    setInitiatingPaymentId(contribution.contribution_id);
    const { data, error: paymentError } = await payContributionFromWallet(contribution.contribution_id);
    setInitiatingPaymentId(null);

    if (paymentError) {
      setError(paymentError.message);
      return;
    }

    setPaymentNotice(`Contribution paid from Sika Wallet. Receipt: ${data?.receipt_id ?? "pending"}`);
    await loadCircle();
  }

  async function handleGenerateRotation(regenerate = false) {
    setMessage("");
    setError("");

    if (regenerate && !window.confirm("Regenerating will replace the current payout order before the circle starts. Continue?")) {
      return;
    }

    setIsUpdatingRotation(true);
    const { data, error: rotationError } = await generateCirclePayoutRotation(circleId, regenerate);
    setIsUpdatingRotation(false);

    if (rotationError) {
      setError(rotationError.message);
      return;
    }

    setMessage(Number(data ?? 0) > 0 ? "Payout rotation generated." : "Payout rotation is already generated.");
    await loadCircle();
  }

  async function handleLockRotation() {
    setMessage("");
    setError("");
    setIsUpdatingRotation(true);
    const { data, error: lockError } = await lockCirclePayoutRotation(circleId);
    setIsUpdatingRotation(false);

    if (lockError) {
      setError(lockError.message);
      return;
    }

    setMessage(Number(data ?? 0) > 0 ? "Payout rotation locked." : "Payout rotation was already locked.");
    await loadCircle();
  }

  function renderPayoutRotationSection() {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Payout Rotation</h2>
          <p className="mt-1 text-xs text-muted-foreground">Fair automatic order for who receives each susu payout.</p>
        </div>

        {myPayoutTurn && (
          <div className="grid grid-cols-3 gap-2">
            <Metric label="My position" value={`#${myPayoutTurn.rotation_position}`} />
            <Metric label="Expected date" value={formatDate(myPayoutTurn.payout_due_date)} />
            <Metric label="Expected amount" value={formatCurrency(Number(myPayoutTurn.payout_amount ?? 0), currency)} />
          </div>
        )}

        <RotationLockCard generated={payoutRotation.length > 0} lockedAt={rotationLockedAt} />

        {isAdmin && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleGenerateRotation(false)}
              disabled={isUpdatingRotation || !canChangeRotation || payoutRotation.length > 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isUpdatingRotation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
              Generate Payout Order
            </button>
            {payoutRotation.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleGenerateRotation(true)}
                  disabled={isUpdatingRotation || !canChangeRotation}
                  className="flex items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate Payout Order
                </button>
                <button
                  onClick={handleLockRotation}
                  disabled={isUpdatingRotation || rotationLocked || hasCircleStarted(circle?.start_date)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-[11px] font-semibold text-success disabled:opacity-60"
                >
                  <LockKeyhole className="h-3.5 w-3.5" /> Lock Payout Order
                </button>
              </div>
            )}
            {payoutRotation.length > 0 && !rotationLocked && (
              <p className="text-[11px] text-muted-foreground">Regenerating replaces this fair random order and is only available before the circle starts.</p>
            )}
            {rotationLocked && <p className="text-[11px] text-muted-foreground">This payout order is locked and will not change automatically.</p>}
          </div>
        )}

        {payoutRotation.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            Payout order has not been generated yet.
          </div>
        ) : membershipStatus === "approved" || isAdmin ? (
          <ul className="flex flex-col gap-3">
            {payoutRotation.map((turn) => (
              <li key={turn.schedule_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">#{turn.rotation_position} {displayMemberName(turn.full_name)} {turn.is_current_user ? "- You" : ""}</p>
                      <VerificationBadge status={turn.verification_status} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatCurrency(Number(turn.payout_amount ?? 0), currency)} - {formatDate(turn.payout_due_date)}
                    </p>
                  </div>
                  <StatusPill status={turn.status} />
                </div>
                {turn.is_current_user && <p className="mt-2 text-[11px] font-semibold text-primary">You - Expected payout: {formatDate(turn.payout_due_date)}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            Approved members can see the full payout order.
          </div>
        )}
      </section>
    );
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
          {paymentNotice && <Notice tone="success" text={paymentNotice} />}

          <div className="grid grid-cols-5 gap-2 px-5 pt-4">
            <TabButton active={tab === "overview"} icon={<WalletCards className="h-4 w-4" />} label="Overview" onClick={() => setTab("overview")} />
            <TabButton active={tab === "members"} icon={<Users className="h-4 w-4" />} label="Members" onClick={() => setTab("members")} />
            <TabButton active={tab === "contributions"} icon={<Calendar className="h-4 w-4" />} label="Contrib." onClick={() => setTab("contributions")} />
            <TabButton active={tab === "rotation"} icon={<Shuffle className="h-4 w-4" />} label="Payouts" onClick={() => setTab("rotation")} />
            <TabButton active={tab === "settings"} icon={<Settings className="h-4 w-4" />} label="Settings" onClick={() => setTab("settings")} />
          </div>

          {tab === "overview" && (
            <section className="flex flex-col gap-5 px-5 pt-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Approved" value={`${approvedMembers.length}/${maxMembers}`} />
                <Metric label="Pending" value={String(pendingMembers.length)} />
                <Metric label="Frequency" value={circle.frequency ?? "Monthly"} />
                <Metric label="Start date" value={formatDate(circle.start_date)} />
                <Metric label="End date" value={formatDate(circle.end_date)} />
                <Metric label="My role" value={currentMember?.role ?? (isAdmin ? "creator" : "member")} />
                <Metric label="Expected" value={formatCurrency(contributionSummary.totalExpected, currency)} />
                <Metric label="Outstanding" value={formatCurrency(contributionSummary.outstanding, currency)} />
                <Metric label="Your turn" value={myPayoutTurn ? `#${myPayoutTurn.rotation_position}` : "Not set"} />
                <Metric label="Payout date" value={myPayoutTurn ? formatDate(myPayoutTurn.payout_due_date) : "Not set"} />
                <Metric label="Payout amount" value={myPayoutTurn ? formatCurrency(Number(myPayoutTurn.payout_amount ?? 0), currency) : "Not set"} />
              </div>
              <CircleHealthMeter health={cycleHealth} />
              <PayoutFundingStatus health={cycleHealth} currency={currency} />
              <TrustScoreFoundation summary={trustSummary} />
              <CustomerActivityLog items={activityLog} />
              <SavingsPlanner defaultTargetAmount={amount} defaultDueDate={toDateInputValue(circle.start_date)} currency={currency} />
              {renderPayoutRotationSection()}
            </section>
          )}

          {tab === "members" && (
            <section className="flex flex-col gap-4 p-5">
              {membershipStatus === "approved" || isAdmin ? (
                <MemberGroup title="Approved members" members={approvedMembers} isAdmin={isAdmin} rotationByMember={rotationByMember} onAction={handleMemberAction} />
              ) : (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
                  {membershipStatus === "pending" ? "Waiting for admin approval." : "Approved members are visible after approval."}
                </div>
              )}
            </section>
          )}

          {tab === "contributions" && (
            <section className="flex flex-col gap-4 p-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Circle contribution ledger</h2>
                <p className="mt-1 text-xs text-muted-foreground">Transparent contribution records for this circle. Sensitive member details stay private.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Total expected" value={formatCurrency(contributionSummary.totalExpected, currency)} />
                <Metric label="Total paid" value={formatCurrency(contributionSummary.totalPaid, currency)} />
                <Metric label="Outstanding" value={formatCurrency(contributionSummary.outstanding, currency)} />
                <Metric label="Overdue" value={formatCurrency(contributionSummary.overdue, currency)} />
              </div>

              {isAdmin && (
                <button
                  onClick={handleGenerateSchedule}
                  disabled={isGeneratingSchedule}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {isGeneratingSchedule && <Loader2 className="h-4 w-4 animate-spin" />}
                  Generate contribution schedule
                </button>
              )}

              {contributions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
                  No contribution records yet.
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {contributions.map((contribution) => (
                    <li key={contribution.contribution_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{displayMemberName(contribution.full_name)}</p>
                        <StatusPill status={contribution.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <LedgerField label="Cycle" value={formatContributionCycle(contribution.due_date)} />
                        <LedgerField label="Amount" value={formatCurrency(Number(contribution.expected_amount ?? amount), currency)} />
                        <LedgerField label="Due date" value={formatDate(contribution.due_date)} />
                        <LedgerField label="Paid date" value={formatDate(contribution.paid_at)} />
                        <LedgerField label="Payment ref" value={contribution.payment_reference ?? "None"} wide />
                      </div>
                      {user?.id === contribution.user_id && ["unpaid", "overdue", "pending", "failed"].includes(contribution.status) && (
                        <button
                          onClick={() => handlePayContributionFromWallet(contribution)}
                          disabled={initiatingPaymentId === contribution.contribution_id}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          {initiatingPaymentId === contribution.contribution_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Pay from Wallet
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "rotation" && (
            <section className="flex flex-col gap-4 p-5">
              {renderPayoutRotationSection()}
            </section>
          )}

          {tab === "settings" && (
            <section className="p-5">
              <CircleRules circle={circle} amount={amount} currency={currency} maxMembers={maxMembers} approvedCount={approvedMembers.length} rotationLocked={rotationLocked} />
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
  rotationByMember,
  onAction,
}: {
  title: string;
  members: CircleMemberDetails[];
  isAdmin: boolean;
  rotationByMember: Map<string, PayoutRotationItem>;
  onAction: (member: CircleMemberDetails, action: "approve" | "reject" | "remove") => void;
}) {
  return (
    <div>
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {members.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">Members will appear here after approval.</div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.membership_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{displayMemberName(member.full_name)}</p>
                    <StatusPill status={member.status} />
                    <VerificationBadge status={member.verification_status} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Joined {formatDate(member.joined_at)} - {member.role}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Rotation position: {rotationByMember.get(member.membership_id)?.rotation_position ? `#${rotationByMember.get(member.membership_id)?.rotation_position}` : "Not set"}
                  </p>
                  {member.requires_capacity_review && (
                    <p className="mt-2 rounded-xl bg-gold/10 px-3 py-2 text-[11px] font-medium text-[color:var(--gold-foreground)]">
                      Capacity review {member.capacity_review_status}. SikaCircle must approve this extra-circle request before member approval.
                    </p>
                  )}
                </div>
              </div>
              {isAdmin && member.role !== "creator" && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {member.status === "pending" && (
                    <>
                      <button
                        onClick={() => onAction(member, "approve")}
                        disabled={member.requires_capacity_review && member.capacity_review_status !== "approved"}
                        className="flex items-center justify-center gap-1 rounded-xl bg-success/10 py-2 text-[11px] font-semibold text-success disabled:bg-muted disabled:text-muted-foreground"
                      >
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

function LedgerField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-muted/40 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs font-semibold">{value}</p>
    </div>
  );
}

type CircleHealth = {
  membersPaid: number;
  membersPending: number;
  membersOverdue: number;
  payoutReadiness: number;
  requiredAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  isReady: boolean;
};

function CircleHealthMeter({ health }: { health: CircleHealth }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        <HeartPulse className="h-4 w-4" />
        <h2 className="font-display text-base font-semibold">Circle health meter</h2>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${health.payoutReadiness}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <RuleMetric label="Members paid" value={String(health.membersPaid)} />
        <RuleMetric label="Members pending" value={String(health.membersPending)} />
        <RuleMetric label="Members overdue" value={String(health.membersOverdue)} />
        <RuleMetric label="Payout readiness" value={`${health.payoutReadiness}%`} />
      </div>
    </section>
  );
}

function PayoutFundingStatus({ health, currency }: { health: CircleHealth; currency: CurrencyCode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-4 w-4" />
          <h2 className="font-display text-base font-semibold">Payout funding status</h2>
        </div>
        <StatusPill status={health.isReady ? "ready" : "not ready"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <RuleMetric label="Required" value={formatCurrency(health.requiredAmount, currency)} />
        <RuleMetric label="Collected" value={formatCurrency(health.collectedAmount, currency)} />
        <RuleMetric label="Outstanding" value={formatCurrency(health.outstandingAmount, currency)} />
        <RuleMetric label="Status" value={health.isReady ? "Ready" : "Not ready"} />
      </div>
    </section>
  );
}

function RotationLockCard({ generated, lockedAt }: { generated: boolean; lockedAt: string | null }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        <LockKeyhole className="h-4 w-4" />
        <p className="font-display text-sm font-semibold">Rotation lock</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <RuleMetric label="Generated by" value={generated ? "System" : "Not generated"} />
        <RuleMetric label="Locked date" value={formatDate(lockedAt)} />
        <RuleMetric label="Edit status" value={lockedAt ? "Cannot be edited" : "Unlocked"} />
        <RuleMetric label="Sequence" value={generated ? "Automatic" : "Waiting"} />
      </div>
    </div>
  );
}

type TrustSummary = {
  score: number;
  completedCircles: number;
  latePayments: number;
  missedPayments: number;
};

function TrustScoreFoundation({ summary }: { summary: TrustSummary }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        <TrendingUp className="h-4 w-4" />
        <h2 className="font-display text-base font-semibold">Trust score foundation</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <RuleMetric label="Trust score" value={`${summary.score}/100`} />
        <RuleMetric label="Completed circles" value={String(summary.completedCircles)} />
        <RuleMetric label="Late payments" value={String(summary.latePayments)} />
        <RuleMetric label="Missed payments" value={String(summary.missedPayments)} />
      </div>
    </section>
  );
}

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  date: string | null;
};

function CustomerActivityLog({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-primary">
        <Activity className="h-4 w-4" />
        <h2 className="font-display text-base font-semibold">Customer activity log</h2>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No customer activity yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold">{item.title}</p>
              <p className="text-[11px] text-muted-foreground">{item.detail} - {formatDate(item.date)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CircleRules({
  circle,
  amount,
  currency,
  maxMembers,
  approvedCount,
  rotationLocked,
}: {
  circle: Circle;
  amount: number;
  currency: CurrencyCode;
  maxMembers: number;
  approvedCount: number;
  rotationLocked: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <h2 className="font-display text-base font-semibold">Circle Rules</h2>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <RuleMetric label="Contribution" value={formatCurrency(amount, currency)} />
        <RuleMetric label="Frequency" value={circle.frequency ?? "monthly"} />
        <RuleMetric label="Minimum members" value="2" />
        <RuleMetric label="Maximum members" value={String(maxMembers)} />
        <RuleMetric label="Current members" value={`${approvedCount}/${maxMembers}`} />
        <RuleMetric label="Start date" value={formatDate(circle.start_date)} />
        <RuleMetric label="End date" value={formatDate(circle.end_date)} />
        <RuleMetric label="Sequence" value={rotationLocked ? "Locked" : "Unlocked"} />
      </div>
      <div className="mt-4 rounded-xl bg-muted/40 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Late payment rule</p>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Late payment rules will be enforced by SikaCircle policy in a later phase.</p>
      </div>
    </div>
  );
}

function RuleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function VerificationBadge({ status }: { status: string | null | undefined }) {
  const verified = status === "verified";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${verified ? "bg-success/10 text-success" : "bg-gold/15 text-[color:var(--gold-foreground)]"}`}>
      {verified ? "verified" : "review"}
    </span>
  );
}

function displayMemberName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "Member";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Member";

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length >= 7 && digitsOnly.length <= 15 && digitsOnly === trimmed.replace(/[\s()+.-]/g, "")) {
    return "Member";
  }

  return trimmed;
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

function formatContributionCycle(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function hasCircleStarted(value: string | null | undefined) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= Date.now();
}

function buildCircleHealth(
  contributions: CircleContributionStatus[],
  approvedMemberCount: number,
  contributionAmount: number,
  paymentSummary: CirclePaymentSummary | null,
): CircleHealth {
  if (paymentSummary) {
    const requiredAmount = Number(paymentSummary.total_expected ?? 0);
    const collectedAmount = Number(paymentSummary.total_paid ?? 0);
    const outstandingAmount = Math.max(
      Number(paymentSummary.pending_amount ?? 0) + Number(paymentSummary.overdue_amount ?? 0) + Number(paymentSummary.failed_amount ?? 0),
      0,
    );

    return {
      membersPaid: Number(paymentSummary.members_paid ?? 0),
      membersPending: Number(paymentSummary.members_pending ?? 0),
      membersOverdue: Number(paymentSummary.members_overdue ?? 0),
      payoutReadiness: Number(paymentSummary.funding_progress ?? 0),
      requiredAmount,
      collectedAmount,
      outstandingAmount,
      isReady: requiredAmount > 0 && collectedAmount >= requiredAmount,
    };
  }

  const paidUsers = new Set<string>();
  const pendingUsers = new Set<string>();
  const overdueUsers = new Set<string>();

  contributions.forEach((contribution) => {
    if (contribution.status === "paid" || contribution.status === "processed") {
      paidUsers.add(contribution.user_id);
      return;
    }

    if (["overdue", "late", "failed"].includes(contribution.status)) {
      overdueUsers.add(contribution.user_id);
      return;
    }

    pendingUsers.add(contribution.user_id);
  });

  const requiredAmount = Math.max(approvedMemberCount * contributionAmount, 0);
  const collectedAmount = contributions
    .filter((contribution) => contribution.status === "paid" || contribution.status === "processed")
    .reduce((sum, contribution) => sum + Number(contribution.expected_amount ?? contributionAmount ?? 0), 0);
  const outstandingAmount = Math.max(requiredAmount - collectedAmount, 0);
  const payoutReadiness = requiredAmount > 0 ? Math.min(Math.round((collectedAmount / requiredAmount) * 100), 100) : 0;

  return {
    membersPaid: paidUsers.size,
    membersPending: contributions.length === 0 ? approvedMemberCount : pendingUsers.size,
    membersOverdue: overdueUsers.size,
    payoutReadiness,
    requiredAmount,
    collectedAmount,
    outstandingAmount,
    isReady: requiredAmount > 0 && collectedAmount >= requiredAmount,
  };
}

function buildTrustSummary(contributions: CircleContributionStatus[], circleStatus: string | null | undefined, userId: string | null | undefined): TrustSummary {
  const userContributions = userId ? contributions.filter((contribution) => contribution.user_id === userId) : [];
  const latePayments = userContributions.filter((contribution) => contribution.status === "overdue" || contribution.status === "late").length;
  const missedPayments = userContributions.filter((contribution) => contribution.status === "failed").length;
  const score = Math.max(0, 100 - latePayments * 5 - missedPayments * 10);

  return {
    score,
    completedCircles: circleStatus === "completed" ? 1 : 0,
    latePayments,
    missedPayments,
  };
}

function buildActivityLog(
  currentMember: CircleMemberDetails | undefined,
  contributions: CircleContributionStatus[],
  payoutRotation: PayoutRotationItem[],
): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (currentMember?.joined_at) {
    items.push({
      id: `joined-${currentMember.membership_id}`,
      title: "Circle joined",
      detail: `Membership status ${currentMember.status}`,
      date: currentMember.joined_at,
    });
  }

  contributions
    .filter((contribution) => contribution.user_id === currentMember?.user_id)
    .slice(0, 3)
    .forEach((contribution) => {
      items.push({
        id: `due-${contribution.contribution_id}`,
        title: "Contribution due",
        detail: `${formatContributionCycle(contribution.due_date)} contribution is ${contribution.status}`,
        date: contribution.due_date,
      });

      if (contribution.payment_status) {
        items.push({
          id: `payment-${contribution.contribution_id}`,
          title: "Payment initiated",
          detail: `Reference ${contribution.payment_reference ?? "pending"}`,
          date: contribution.payment_created_at ?? contribution.paid_at ?? contribution.due_date,
        });
      }
    });

  payoutRotation
    .filter((turn) => turn.is_current_user)
    .slice(0, 1)
    .forEach((turn) => {
      items.push({
        id: `payout-${turn.schedule_id}`,
        title: "Payout scheduled",
        detail: `Position #${turn.rotation_position} is ${turn.status}`,
        date: turn.payout_due_date,
      });
    });

  return items
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    .slice(0, 6);
}
