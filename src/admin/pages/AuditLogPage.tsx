import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { getAdminOverview, type AdminAuditLog } from "@/admin/api";

export function AuditLogPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getAdminOverview().then(({ data, error }) => {
      if (!isMounted) return;
      setLogs(data?.auditLogs ?? []);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return logs;

    return logs.filter((log) => [
      log.action,
      log.target_type,
      log.target_id,
      log.staffName,
      log.staffEmail,
      log.notes,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [logs, query]);

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Operations Portal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Activity</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Latest staff audit actions across verifications, users, circle members, circles, and payouts.
        </p>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by action, staff, target, or notes"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit logs
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
          <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Action</span>
            <span>Staff</span>
            <span>Target</span>
            <span>Time / Notes</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredLogs.map((log) => (
              <li key={log.id} className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium capitalize">{log.action.replaceAll("_", " ")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{readStaffRole(log.metadata)}</p>
                </div>
                <div>
                  <p className="font-medium">{log.staffName || log.staffEmail || "Unknown staff"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{log.staff_user_id ?? "n/a"}</p>
                </div>
                <div>
                  <p className="font-medium capitalize">{log.target_type.replaceAll("_", " ")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{log.target_id ?? "n/a"}</p>
                </div>
                <div>
                  <p className="font-medium">{formatDateTime(log.created_at)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{log.notes || "No notes"}</p>
                </div>
              </li>
            ))}
            {filteredLogs.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">No audit logs found.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function readStaffRole(metadata: Record<string, unknown>) {
  const role = metadata.staff_role;
  return typeof role === "string" ? role.replace("_", " ") : "staff";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
