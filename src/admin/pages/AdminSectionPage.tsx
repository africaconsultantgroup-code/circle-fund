import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { getAdminOverview, type AdminOverview } from "@/admin/api";

type AdminSectionPageProps = {
  title: string;
  description: string;
  metricLabel?: string;
  metricValue?: (overview: AdminOverview) => number;
};

export function AdminSectionPage({ title, description, metricLabel = "Live records", metricValue }: AdminSectionPageProps) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getAdminOverview().then(({ data, error }) => {
      if (!isMounted) return;
      setOverview(data ?? null);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo(() => {
    if (!overview) return 0;
    return metricValue ? metricValue(overview) : overview.metrics.totalUsers;
  }, [metricValue, overview]);

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Operations Portal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading live admin data
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metricLabel}</p>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card md:col-span-2">
            <p className="font-display text-sm font-semibold">Live data connection</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This admin section is mounted and connected to the existing Circle Fund Supabase admin overview feed.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
