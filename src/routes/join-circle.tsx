import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { KeyRound, Link2, ScanLine, ShieldAlert } from "lucide-react";
import { isFullyVerified, verification, trustScore } from "@/lib/mock-data";

export const Route = createFileRoute("/join-circle")({
  component: JoinCirclePage,
});

function JoinCirclePage() {
  const navigate = useNavigate();
  const verified = isFullyVerified(verification);
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Join Circle" back="/circles" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        {!verified && (
          <Link to="/verify" className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">Verification required</p>
              <p className="text-[11px] opacity-80">You must complete KYC before joining a circle.</p>
            </div>
          </Link>
        )}

        <div className="rounded-3xl bg-gradient-card p-6 text-primary-foreground shadow-elevated">
          <KeyRound className="h-8 w-8 text-gold" />
          <h2 className="mt-3 font-display text-xl font-bold">Enter invite code</h2>
          <p className="mt-1 text-sm text-primary-foreground/70">Ask the circle creator for the 6-character code.</p>

          <div className="mt-5 grid grid-cols-6 gap-2">
            {["F", "A", "M", "2", "X", "9"].map((c, i) => (
              <div key={i} className="flex h-12 items-center justify-center rounded-xl bg-white/15 font-display text-lg font-bold">
                {c}
              </div>
            ))}
          </div>

          <button
            disabled={!verified}
            onClick={() => navigate({ to: "/circle/$id", params: { id: "family-savers" } })}
            className="mt-5 w-full rounded-2xl bg-gradient-gold py-3.5 font-display text-sm font-semibold text-gold-foreground disabled:opacity-50"
          >
            {verified ? "Join Circle" : "Verify to join"}
          </button>
          <p className="mt-3 text-[10px] text-primary-foreground/60">Trust score {trustScore.score} · max circle value GHS {trustScore.maxCircleValue.toLocaleString()}</p>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <button className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
            <Link2 className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold">Paste invite link</p>
            <p className="text-[11px] text-muted-foreground">Use a link shared with you</p>
          </div>
        </button>

        <button className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
            <ScanLine className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold">Scan QR code</p>
            <p className="text-[11px] text-muted-foreground">Open camera to scan</p>
          </div>
        </button>

        <p className="mt-auto text-center text-xs text-muted-foreground">
          Only join circles from people you trust. SikaCircle never asks for your password.
        </p>
      </div>
    </div>
  );
}