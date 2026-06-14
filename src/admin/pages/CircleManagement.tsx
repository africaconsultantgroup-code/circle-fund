import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { getAdminOverview, type AdminCircle } from "@/admin/api";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

export function CircleManagement() {
  const [circles, setCircles] = useState<AdminCircle[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getAdminOverview().then(({ data, error }) => {
      if (!isMounted) return;
      setCircles(data?.circles ?? []);
      setError(error?.message ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredCircles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return circles;

    return circles.filter((circle) => [
      circle.name,
      circle.ownerName,
      circle.ownerEmail,
      circle.status,
      circle.frequency,
      circle.inviteCode,
      circle.id,
    ].some((value) => value?.toLowerCase().includes(term)));
  }, [circles, query]);

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Operations Portal</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Circles</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review live circles, owners, members, and pending requests.</p>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by circle, owner, invite code, status, or circle ID"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {isLoading && (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading circles
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
          <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Circle</span>
            <span>Owner</span>
            <span>Amount</span>
            <span>Members</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-border">
            {filteredCircles.map((circle) => (
              <li key={circle.id} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{circle.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{circle.inviteCode || circle.id}</p>
                </div>
                <div>
                  <p className="font-medium">{circle.ownerName || "Unknown owner"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{circle.ownerEmail || circle.ownerId}</p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {formatCurrency(Number(circle.contributionAmount ?? 0), (circle.baseCurrency ?? "GHS") as CurrencyCode)} / {circle.frequency ?? "n/a"}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {circle.memberCount}/{circle.maxMembers}
                  {circle.pendingMemberCount > 0 ? ` (${circle.pendingMemberCount} pending)` : ""}
                </span>
                <StatusPill value={circle.status} good={circle.status === "active"} />
              </li>
            ))}
            {filteredCircles.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">No circles match your search.</li>
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
