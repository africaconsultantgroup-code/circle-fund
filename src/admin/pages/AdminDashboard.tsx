import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { listAdminUsers, type AdminUser } from "@/admin/api";

export function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    listAdminUsers().then(({ data, error }) => {
      if (!isMounted) return;
      setUsers(data?.users ?? []);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const verified = users.filter((user) => user.verification?.verification_status === "verified").length;
    const pending = users.filter((user) => user.verification && user.verification.verification_status !== "verified").length;
    const active = users.filter((user) => user.accountStatus === "active").length;
    return { total: users.length, verified, pending, active };
  }, [users]);

  return (
    <section>
      <h1 className="font-display text-2xl font-bold tracking-tight">Admin Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">Operational overview for users and verification readiness.</p>

      {isLoading && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading admin metrics
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric icon={<Users className="h-4 w-4" />} label="Total users" value={stats.total} />
          <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Verified" value={stats.verified} />
          <Metric icon={<ShieldAlert className="h-4 w-4" />} label="Needs review" value={stats.pending} />
          <Metric icon={<Users className="h-4 w-4" />} label="Active accounts" value={stats.active} />
        </div>
      )}
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span>
      <p className="mt-3 font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
