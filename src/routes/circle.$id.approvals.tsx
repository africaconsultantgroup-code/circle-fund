import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Check, Loader2, ShieldAlert, UserCheck, Users, X } from "lucide-react";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { getCircleById, listCircleMembers, manageCircleMember, type Circle, type CircleMemberDetails } from "@/lib/db";
import { requireAuth } from "@/lib/phone-guard";

export const Route = createFileRoute("/circle/$id/approvals")({
  beforeLoad: requireAuth,
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { id } = Route.useParams();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMemberDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentMember = useMemo(() => members.find((member) => member.user_id === user?.id), [members, user?.id]);
  const isAdmin = Boolean(circle?.owner_id === user?.id || (currentMember?.status === "approved" && ["creator", "admin"].includes(currentMember.role)));
  const pendingMembers = members.filter((member) => member.status === "pending");
  const approvedMembers = members.filter((member) => member.status === "approved");

  useEffect(() => {
    void loadApprovals();
  }, [id]);

  async function loadApprovals() {
    setLoading(true);
    setError("");

    const currentUser = await getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      setError("Please sign in to view members.");
      setLoading(false);
      return;
    }

    const [circleResult, membersResult] = await Promise.all([
      getCircleById(id),
      listCircleMembers(id),
    ]);

    if (circleResult.error || !circleResult.data) {
      setError("Circle not found or you do not have access.");
      setLoading(false);
      return;
    }

    setCircle(circleResult.data);
    setMembers((membersResult.data ?? []) as CircleMemberDetails[]);
    if (membersResult.error) {
      setError(membersResult.error.message);
    }
    setLoading(false);
  }

  async function handleAction(member: CircleMemberDetails, action: "approve" | "reject") {
    setMessage("");
    setError("");

    const { error: actionError } = await manageCircleMember(member.membership_id, action);
    if (actionError) {
      setError(actionError.message);
      return;
    }

    setMessage(action === "approve" ? "Member approved." : "Member rejected.");
    await loadApprovals();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Member approvals" subtitle={circle?.name ?? "Circle members"} back="/circles" />

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading members
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-5 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
              <ShieldAlert className="h-4 w-4" />
              <p className="text-[11px] font-medium">{error}</p>
            </div>
          )}
          {message && (
            <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-success">
              <UserCheck className="h-4 w-4" />
              <p className="text-[11px] font-medium">{message}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Metric label="Pending" value={pendingMembers.length} />
            <Metric label="Approved" value={approvedMembers.length} />
          </div>

          {isAdmin && (
            <MemberSection
              title="Pending members"
              empty="No pending member requests."
              members={pendingMembers}
              isAdmin={isAdmin}
              showActions
              onAction={handleAction}
            />
          )}

          {!isAdmin && currentMember?.status === "pending" && (
            <StatusNotice text="Waiting for admin approval." />
          )}
          {!isAdmin && currentMember?.status === "rejected" && (
            <StatusNotice text="Your request was not approved." danger />
          )}

          {(isAdmin || currentMember?.status === "approved") && (
            <MemberSection
              title="Approved members"
              empty="No approved members yet."
              members={approvedMembers}
              isAdmin={isAdmin}
              showActions={false}
              onAction={handleAction}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MemberSection({
  title,
  empty,
  members,
  isAdmin,
  showActions,
  onAction,
}: {
  title: string;
  empty: string;
  members: CircleMemberDetails[];
  isAdmin: boolean;
  showActions: boolean;
  onAction: (member: CircleMemberDetails, action: "approve" | "reject") => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-display text-base font-semibold">{title}</h2>
      </div>
      {members.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">{empty}</div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.membership_id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{member.full_name ?? "Member"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{member.phone ?? "No phone"} - {member.country ?? "No country"} - {member.preferred_currency ?? "GHS"}</p>
                  <p className="text-[11px] text-muted-foreground">Joined {formatDate(member.joined_at)} - {member.role}</p>
                </div>
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[color:var(--gold-foreground)]">{member.status}</span>
              </div>
              {isAdmin && showActions && member.status === "pending" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => onAction(member, "reject")} className="flex items-center justify-center gap-1.5 rounded-xl border border-destructive/30 py-2 text-[11px] font-semibold text-destructive">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                  <button onClick={() => onAction(member, "approve")} className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-primary py-2 text-[11px] font-semibold text-primary-foreground">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusNotice({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${danger ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-gold/40 bg-gold/10 text-[color:var(--gold-foreground)]"}`}>
      {text}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
