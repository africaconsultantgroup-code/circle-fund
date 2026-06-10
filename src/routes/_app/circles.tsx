import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Search, LogIn, Loader2 } from "lucide-react";
import { formatGHS } from "@/lib/mock-data";
import { loadUserCircles, type UserCircle } from "@/lib/user-circles";

export const Route = createFileRoute("/_app/circles")({
  component: CirclesPage,
});

function CirclesPage() {
  const [circles, setCircles] = useState<UserCircle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    loadUserCircles().then(({ data, error }) => {
      if (!isMounted) return;
      setCircles(data);
      setError(error ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col px-5 pt-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">My Circles</h1>
          <p className="text-xs text-muted-foreground">{circles.length} active circles</p>
        </div>
        <Link to="/create-circle" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-card">
          <Plus className="h-5 w-5" />
        </Link>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input placeholder="Search circles" className="flex-1 bg-transparent text-sm outline-none" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Link to="/create-circle" className="flex flex-col items-start gap-2 rounded-2xl bg-gradient-primary p-4 text-primary-foreground shadow-card">
          <Plus className="h-5 w-5" />
          <p className="font-display text-sm font-semibold">Create circle</p>
          <p className="text-[11px] text-primary-foreground/70">Invite up to 15 members</p>
        </Link>
        <Link to="/join-circle" className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 shadow-card">
          <LogIn className="h-5 w-5 text-primary" />
          <p className="font-display text-sm font-semibold">Join circle</p>
          <p className="text-[11px] text-muted-foreground">Use invite code or link</p>
        </Link>
      </div>

      <ul className="mt-7 flex flex-col gap-3">
        {isLoading && (
          <li className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading circles
          </li>
        )}
        {error && (
          <li className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </li>
        )}
        {!isLoading && !error && circles.length === 0 && (
          <li className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            No circles yet. Create your first circle to get started.
          </li>
        )}
        {circles.map((c) => (
          <li key={c.id}>
            <Link to="/circle/$id" params={{ id: c.id }} className="block rounded-3xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground font-display font-semibold">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-semibold">{c.name}</p>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{c.category}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{c.memberCount}/{c.maxMembers} members - {formatGHS(c.amount)}/{c.frequency}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${(c.currentCycle / c.totalCycles) * 100}%` }} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{c.currentCycle}/{c.totalCycles}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Next: <span className="font-semibold text-foreground">{c.nextRecipient}</span></span>
                <span className="text-muted-foreground">{c.nextPayoutDate}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
