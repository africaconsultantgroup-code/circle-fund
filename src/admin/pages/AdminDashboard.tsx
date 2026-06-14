import { useEffect, useMemo, useState } from "react";
import { Circle, Loader2, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { getAdminOverview, type AdminMetrics } from "@/admin/api";

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getAdminOverview().then(({ data, error }) => {
      if (!isMounted) return;
      setMetrics(data?.metrics ?? null);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => metrics ?? {
    totalUsers: 0,
    verifiedUsers: 0,
    pendingVerifications: 0,
    suspendedUsers: 0,
    totalCircles: 0,
    activeCircles: 0,
  }, [metrics]);

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
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric icon={<Users className="h-4 w-4" />} label="Total Users" value={stats.totalUsers} />
          <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Verified Users" value={stats.verifiedUsers} />
          <Metric icon={<ShieldAlert className="h-4 w-4" />} label="Pending Verifications" value={stats.pendingVerifications} />
          <Metric icon={<Users className="h-4 w-4" />} label="Suspended Users" value={stats.suspendedUsers} />
          <Metric icon={<Circle className="h-4 w-4" />} label="Total Circles" value={stats.totalCircles} />
          <Metric icon={<Circle className="h-4 w-4" />} label="Active Circles" value={stats.activeCircles} />
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
