import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Search, ShieldAlert } from "lucide-react";
import { getAdminOverview, updateAdminUserRole, type AdminUser } from "@/admin/api";
import type { UserRole } from "@/lib/supabase-types";

const assignableRoles: UserRole[] = ["super_admin", "operations", "compliance", "finance", "support", "customer"];

export function RoleManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [staffRole, setStaffRole] = useState("");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = async () => {
    setIsLoading(true);
    const { data, error } = await getAdminOverview();
    setUsers(data?.users ?? []);
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
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="grid grid-cols-[1.3fr_1fr_1fr_0.9fr_0.9fr_1fr] gap-3 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Role</span>
            <span>Verification</span>
            <span>Account</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <li key={user.userId} className="grid grid-cols-[1.3fr_1fr_1fr_0.9fr_0.9fr_1fr] gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{user.fullName || "Unnamed user"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{user.userId}</p>
                </div>
                <p className="text-xs font-medium text-muted-foreground">{user.email || "No email"}</p>
                <p className="text-xs font-medium text-muted-foreground">{user.phone || "No phone"}</p>
                <div>
                  {canAssignRoles ? (
                    <select
                      value={normalizeRole(user.role)}
                      disabled={busyUserId === user.userId}
                      onChange={(event) => handleRoleChange(user, event.target.value as UserRole)}
                      className="w-full rounded-xl border border-input bg-muted/40 px-3 py-2 text-xs font-semibold outline-none"
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
                <StatusPill value={user.accountStatus} good={user.accountStatus === "active"} />
              </li>
            ))}
            {filteredUsers.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">No users match your search.</li>
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

function StatusPill({ value, good }: { value: string; good: boolean }) {
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${good ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      {formatRole(value)}
    </span>
  );
}
