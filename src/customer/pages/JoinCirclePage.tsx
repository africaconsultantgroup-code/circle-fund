import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { KeyRound, Link2, ScanLine, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { joinCircle } from "@/lib/db";
import { getCircleEligibility, type CircleEligibility } from "@/lib/onboarding";
import { trustScore } from "@/lib/mock-data";

export function JoinCirclePage() {
  const navigate = useNavigate();
  const [eligibility, setEligibility] = useState<CircleEligibility | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);
  const [inviteValue, setInviteValue] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const eligible = Boolean(eligibility?.isEligible);

  useEffect(() => {
    let isMounted = true;

    getCircleEligibility().then((result) => {
      if (!isMounted) return;
      setEligibility(result);
      setIsCheckingEligibility(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleJoin = async () => {
    setJoinError("");

    const currentEligibility = eligibility ?? await getCircleEligibility();
    if (!currentEligibility.isEligible || !currentEligibility.userId) {
      setEligibility(currentEligibility);
      setJoinError(currentEligibility.message || "Complete onboarding before joining a circle.");
      return;
    }

    if (!isUuid(inviteValue.trim())) {
      setJoinError("Enter a valid circle invite UUID. Short invite-code lookup is not configured yet.");
      return;
    }

    setIsJoining(true);
    try {
      const { data, error } = await joinCircle(inviteValue.trim(), currentEligibility.userId);
      if (error || !data) {
        setJoinError(error?.message ?? "We could not join this circle. Please try again.");
        return;
      }

      navigate({ to: "/circle/$id", params: { id: data.circle_id } });
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "We could not join this circle. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Join Circle" back="/circles" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        {isCheckingEligibility && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-muted-foreground shadow-card">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-[11px] font-medium">Checking onboarding eligibility...</p>
          </div>
        )}

        {!isCheckingEligibility && !eligible && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5" />
              <div className="flex-1">
                <p className="font-display text-sm font-semibold">Complete onboarding before joining</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {(eligibility?.issues ?? []).map((issue) => (
                    <li key={issue.key} className="text-[11px] opacity-85">{issue.message}</li>
                  ))}
                </ul>
                <Link to={eligibility?.issues[0]?.to ?? "/verify"} className="mt-3 inline-flex rounded-xl bg-destructive px-3 py-2 text-[11px] font-semibold text-destructive-foreground">
                  {eligibility?.issues[0]?.actionLabel ?? "Complete onboarding"}
                </Link>
              </div>
            </div>
          </div>
        )}

        {eligible && (
          <div className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-success">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-[11px] font-medium">Onboarding complete - you can join eligible circles</p>
          </div>
        )}

        <div className="rounded-3xl bg-gradient-card p-6 text-primary-foreground shadow-elevated">
          <KeyRound className="h-8 w-8 text-gold" />
          <h2 className="mt-3 font-display text-xl font-bold">Enter invite code</h2>
          <p className="mt-1 text-sm text-primary-foreground/70">Ask the circle creator for the invite link or circle ID.</p>

          <input
            value={inviteValue}
            onChange={(event) => setInviteValue(event.target.value)}
            placeholder="Circle UUID"
            className="mt-5 w-full rounded-2xl border border-white/15 bg-white/15 px-4 py-3.5 font-mono text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/45"
          />

          <button
            disabled={!eligible || isCheckingEligibility || isJoining}
            onClick={handleJoin}
            className="mt-5 w-full rounded-2xl bg-gradient-gold py-3.5 font-display text-sm font-semibold text-gold-foreground disabled:opacity-50"
          >
            {isJoining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Joining
              </span>
            ) : eligible ? "Join Circle" : "Complete onboarding to join"}
          </button>
          <p className="mt-3 text-[10px] text-primary-foreground/60">Trust score {trustScore.score} - max circle value GHS {trustScore.maxCircleValue.toLocaleString()}</p>
        </div>

        {joinError && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{joinError}</p>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <button disabled={!eligible} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left disabled:opacity-50">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
            <Link2 className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold">Paste invite link</p>
            <p className="text-[11px] text-muted-foreground">Use a link shared with you</p>
          </div>
        </button>

        <button disabled={!eligible} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left disabled:opacity-50">
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
