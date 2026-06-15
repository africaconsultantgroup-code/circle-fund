import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { getAdminOverview, type AdminUser } from "@/admin/api";

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getAdminOverview().then(({ data, error }) => {
      if (!isMounted) return;
      setUsers(data?.users ?? []);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;

    return users.filter((user) => [
      user.email,
      user.fullName,
      user.phone,
      user.userId,
      user.accountStatus,
      user.verification?.verification_status,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [query, users]);

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Operations Portal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Users</h1>
        <p className="mt-2 text-sm text-muted-foreground">Search users and review account and verification status.</p>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email, phone, status, or user ID"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="grid grid-cols-[1.5fr_0.8fr_0.9fr_1fr_1fr] gap-3 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>User</span>
            <span>Active circles</span>
            <span>Account</span>
            <span>Verification</span>
            <span>Role</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <li key={user.userId} className="grid grid-cols-[1.5fr_0.8fr_0.9fr_1fr_1fr] items-center gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{user.fullName || user.email || "Unnamed user"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{user.email || user.userId}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{user.activeCircleCount}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{user.activeAdminCircleCount} admin</p>
                </div>
                <StatusPill value={user.accountStatus} good={user.accountStatus === "active"} />
                <StatusPill
                  value={user.verification?.is_test_verification ? "Test verified" : user.verification?.verification_status ?? "not_started"}
                  good={user.verification?.verification_status === "verified" || Boolean(user.verification?.is_test_verification)}
                />
                <span className="text-xs font-semibold capitalize text-muted-foreground">{user.role}</span>
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

function StatusPill({ value, good }: { value: string; good: boolean }) {
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${good ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      {value.replace("_", " ")}
    </span>
  );
}
