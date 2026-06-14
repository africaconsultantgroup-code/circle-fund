import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Search, ShieldAlert, UserPlus } from "lucide-react";
import {
  cancelStaffInvitation,
  disableStaffAccount,
  getAdminOverview,
  manageStaff,
  updateAdminUserRole,
  type AdminUser,
  type StaffInvitation,
} from "@/admin/api";
import type { StaffRole, UserRole } from "@/lib/supabase-types";

const assignableRoles: UserRole[] = ["super_admin", "operations", "compliance", "finance", "support", "customer"];
const staffInviteRoles: StaffRole[] = ["operations", "compliance", "finance", "support", "super_admin"];
const roleTableColumns = "minmax(220px,1.4fr) minmax(220px,1.2fr) minmax(140px,0.8fr) minmax(170px,0.9fr) minmax(150px,0.8fr) minmax(170px,0.9fr)";

export function RoleManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [staffInvitations, setStaffInvitations] = useState<StaffInvitation[]>([]);
  const [staffRole, setStaffRole] = useState("");
  const [query, setQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("operations");
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [busyInvitationId, setBusyInvitationId] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = async () => {
    setIsLoading(true);
    const { data, error } = await getAdminOverview();
    setUsers(data?.users ?? []);
    setStaffInvitations(data?.staffInvitations ?? []);
    setStaffRole(data?.staffRole ?? "");
    setError(error?.message ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;

    return users.filter((user) => [
      user.fullName,
      user.email,
      user.phone,
      user.userId,
      user.role,
      user.accountStatus,
      user.verification?.verification_status,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [query, users]);

  const canAssignRoles = staffRole === "super_admin";

  const handleRoleChange = async (user: AdminUser, role: UserRole) => {
    setError("");
    setMessage("");
    setBusyUserId(user.userId);

    const { error } = await updateAdminUserRole(user.userId, role);
    setBusyUserId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`${user.fullName || user.email || "User"} role updated to ${formatRole(role)}.`);
    await loadUsers();
  };

  const handleInviteStaff = async () => {
    setError("");
    setMessage("");
    setIsInviting(true);

    const { data, error } = await manageStaff("invite", { email: inviteEmail, role: inviteRole });
    setIsInviting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(data?.matchedExistingUser
      ? `${inviteEmail} matched an existing account and was assigned ${formatRole(inviteRole)}.`
      : `Invitation created for ${inviteEmail}.`);
    setInviteEmail("");
    await loadUsers();
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setError("");
    setMessage("");
    setBusyInvitationId(invitationId);

    const { error } = await cancelStaffInvitation(invitationId);
    setBusyInvitationId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Staff invitation cancelled.");
    await loadUsers();
  };

  const handleDisableStaff = async (user: AdminUser) => {
    setError("");
    setMessage("");
    setBusyUserId(user.userId);

    const { error } = await disableStaffAccount(user.userId);
    setBusyUserId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`${displayUserName(user)} has been disabled.`);
    await loadUsers();
  };

  const pendingInvitations = staffInvitations.filter((invitation) => invitation.status === "pending");

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Operations Portal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Role Management</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review authentication status and assign staff/customer roles. Only super admins can change roles.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email, phone, role, status, or user ID"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {!canAssignRoles && !isLoading && !error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-[color:var(--gold-foreground)]">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">Role assignment is restricted to super admins. You can review users in read-only mode.</p>
        </div>
      )}

      {canAssignRoles && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Staff email</label>
              <input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                type="email"
                placeholder="staff@email.com"
                className="mt-1.5 h-11 w-full rounded-xl border border-input bg-muted/40 px-3 text-sm outline-none"
              />
            </div>
            <div className="w-full md:w-56">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as StaffRole)}
                className="mt-1.5 h-11 w-full rounded-xl border border-input bg-muted/40 px-3 text-sm font-semibold outline-none"
              >
                {staffInviteRoles.map((role) => (
                  <option key={role} value={role}>{formatRole(role)}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!inviteEmail || isInviting}
              onClick={handleInviteStaff}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Invite staff
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-success">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <div style={{ gridTemplateColumns: roleTableColumns }} className="grid min-w-[1120px] items-center gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Role</span>
            <span>Verification</span>
            <span>Account</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <li key={user.userId} style={{ gridTemplateColumns: roleTableColumns }} className="grid min-w-[1120px] items-center gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayUserName(user)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.userId}</p>
                </div>
                <p className="truncate text-xs font-medium text-muted-foreground">{user.email || "No email"}</p>
                <p className="truncate text-xs font-medium text-muted-foreground">{user.phone || "No phone"}</p>
                <div className="flex items-center">
                  {canAssignRoles ? (
                    <select
                      value={normalizeRole(user.role)}
                      disabled={busyUserId === user.userId}
                      onChange={(event) => handleRoleChange(user, event.target.value as UserRole)}
                      className="h-9 w-full rounded-full border border-input bg-muted/40 px-3 text-xs font-semibold capitalize outline-none"
                    >
                      {assignableRoles.map((role) => (
                        <option key={role} value={role}>{formatRole(role)}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusPill value={normalizeRole(user.role)} good={user.role !== "customer"} />
                  )}
                </div>
                <StatusPill value={user.verification?.verification_status ?? "not_started"} good={user.verification?.verification_status === "verified"} />
                <div className="flex items-center gap-2">
                  <StatusPill value={user.accountStatus} good={user.accountStatus === "active"} />
                  {canAssignRoles && normalizeRole(user.role) !== "customer" && user.accountStatus === "active" && (
                    <button
                      type="button"
                      disabled={busyUserId === user.userId}
                      onClick={() => handleDisableStaff(user)}
                      className="h-9 rounded-full border border-destructive/30 px-3 text-[11px] font-semibold text-destructive disabled:opacity-50"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </li>
            ))}
            {filteredUsers.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">No users match your search.</li>
            )}
          </ul>
        </div>
      )}

      {canAssignRoles && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-display text-base font-semibold">Pending staff invitations</h2>
            <p className="mt-1 text-xs text-muted-foreground">Invited staff can sign up normally with the invited email to receive admin access.</p>
          </div>
          <ul className="divide-y divide-border">
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} className="grid grid-cols-[1.4fr_0.8fr_0.8fr_auto] items-center gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{invitation.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Invited {formatDate(invitation.invited_at)}</p>
                </div>
                <StatusPill value={invitation.role} good />
                <StatusPill value={invitation.status} good={false} />
                <button
                  type="button"
                  disabled={busyInvitationId === invitation.id}
                  onClick={() => handleCancelInvitation(invitation.id)}
                  className="h-9 rounded-full border border-destructive/30 px-3 text-[11px] font-semibold text-destructive disabled:opacity-50"
                >
                  {busyInvitationId === invitation.id ? "Cancelling" : "Cancel"}
                </button>
              </li>
            ))}
            {pendingInvitations.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-muted-foreground">No pending staff invitations.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function normalizeRole(role: string): UserRole {
  return role === "admin" ? "super_admin" : role as UserRole;
}

function formatRole(role: string) {
  return role.replace("_", " ");
}

function displayUserName(user: AdminUser) {
  return user.fullName || user.email || user.phone || user.userId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function StatusPill({ value, good }: { value: string; good: boolean }) {
  return (
    <span className={`inline-flex h-9 w-fit items-center whitespace-nowrap rounded-full px-3 text-[11px] font-semibold capitalize ${good ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      {formatRole(value)}
    </span>
  );
}
