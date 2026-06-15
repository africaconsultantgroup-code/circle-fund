import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { CheckCircle2, KeyRound, Link2, ScanLine, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { countCircleMembers, getCircleByInviteToken, joinCircle, normalizeInviteToken, type Circle } from "@/lib/db";
import { getCircleEligibility, type CircleEligibility } from "@/lib/onboarding";
import { formatCurrency } from "@/lib/diaspora";

type CirclePreview = {
  circle: Circle;
  memberCount: number;
};

export function JoinCirclePage() {
  const navigate = useNavigate();
  const [eligibility, setEligibility] = useState<CircleEligibility | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);
  const [inviteValue, setInviteValue] = useState("");
  const [preview, setPreview] = useState<CirclePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [success, setSuccess] = useState("");
  const eligible = Boolean(eligibility?.isEligible);

  useEffect(() => {
    let isMounted = true;
    const code = new URLSearchParams(window.location.search).get("code") ?? "";
    if (code) setInviteValue(normalizeInviteToken(code));

    getCircleEligibility().then((result) => {
      if (!isMounted) return;
      setEligibility(result);
      setIsCheckingEligibility(false);
    });

    if (code) void loadPreview(code);

    return () => {
      isMounted = false;
    };
  }, []);

  const loadPreview = async (rawCode = inviteValue) => {
    setJoinError("");
    setPreview(null);

    const code = normalizeInviteToken(rawCode);
    if (!code) {
      setJoinError("Enter an invite code or open an invite link.");
      return null;
    }

    setIsLoadingPreview(true);
    const { data: circle, error } = await getCircleByInviteToken(code);
    if (error || !circle) {
      setJoinError("We could not find an active circle for this invite code.");
      setIsLoadingPreview(false);
      return null;
    }

    const { count, error: countError } = await countCircleMembers(circle.id);
    setIsLoadingPreview(false);
    if (countError) {
      setJoinError(countError.message);
      return null;
    }

    const nextPreview = { circle, memberCount: count ?? 0 };
    setPreview(nextPreview);
    return nextPreview;
  };

  const handleJoin = async () => {
    setJoinError("");

    const currentEligibility = eligibility ?? await getCircleEligibility();
    if (!currentEligibility.isEligible || !currentEligibility.userId) {
      setEligibility(currentEligibility);
      setJoinError(currentEligibility.message || "Please sign in before joining a circle.");
      return;
    }

    const currentPreview = preview ?? await loadPreview();
    if (!currentPreview) return;

    const maxMembers = Math.min(currentPreview.circle.max_members ?? 15, 15);
    if (currentPreview.memberCount >= maxMembers) {
      setJoinError("This circle already has the maximum 15 members.");
      return;
    }

    setIsJoining(true);
    try {
      const { data, error } = await joinCircle(currentPreview.circle.id, currentEligibility.userId);
      if (error || !data) {
        setJoinError(error?.message ?? "We could not join this circle. Please try again.");
        return;
      }

      setSuccess(data.requires_capacity_review
        ? "You are already in 3 active susu groups. SikaCircle needs to review your capacity before approving this request."
        : "Join request sent. Opening circle details.");
      setTimeout(() => navigate({ to: "/circles/$id", params: { id: data.circle_id } }), 700);
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
            <p className="text-[11px] font-medium">Checking verification eligibility...</p>
          </div>
        )}

        {!isCheckingEligibility && !eligible && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5" />
              <div className="flex-1">
                <p className="font-display text-sm font-semibold">Sign in before joining</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {(eligibility?.issues ?? []).map((issue) => (
                    <li key={issue.key} className="text-[11px] opacity-85">{issue.message}</li>
                  ))}
                </ul>
                <Link to={eligibility?.issues[0]?.to ?? "/verify"} className="mt-3 inline-flex rounded-xl bg-destructive px-3 py-2 text-[11px] font-semibold text-destructive-foreground">
                  {eligibility?.issues[0]?.actionLabel ?? "Sign in"}
                </Link>
              </div>
            </div>
          </div>
        )}

        {eligible && (
          <div className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-2.5 text-success">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-[11px] font-medium">You can join circles for testing. Verification may be required before contributions start.</p>
          </div>
        )}

        <div className="rounded-3xl bg-gradient-card p-6 text-primary-foreground shadow-elevated">
          <KeyRound className="h-8 w-8 text-gold" />
          <h2 className="mt-3 font-display text-xl font-bold">Enter invite code</h2>
          <p className="mt-1 text-sm text-primary-foreground/70">Open an invite link or paste the code shared by the circle creator.</p>

          <input
            value={inviteValue}
            onChange={(event) => setInviteValue(event.target.value.toUpperCase())}
            placeholder="SC-ABC12345"
            className="mt-5 w-full rounded-2xl border border-white/15 bg-white/15 px-4 py-3.5 font-mono text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/45"
          />

          <button
            disabled={isLoadingPreview}
            onClick={() => void loadPreview()}
            className="mt-3 w-full rounded-2xl border border-white/20 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isLoadingPreview ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading preview
              </span>
            ) : "Preview circle"}
          </button>

          {preview && (
            <div className="mt-4 rounded-2xl bg-white/15 p-4">
              <p className="font-display text-base font-semibold">{preview.circle.name}</p>
              <p className="mt-1 text-xs text-primary-foreground/75">
                {formatCurrency(Number(preview.circle.contribution_amount ?? 0), preview.circle.base_currency ?? "GHS")} / {preview.circle.frequency ?? "monthly"}
              </p>
              <p className="mt-2 text-[11px] text-primary-foreground/70">
                {preview.memberCount}/{Math.min(preview.circle.max_members ?? 15, 15)} members
              </p>
              <p className="mt-1 text-[11px] text-primary-foreground/70">
                Starts {formatDate(preview.circle.start_date)}
              </p>
            </div>
          )}

          <button
            disabled={!eligible || isCheckingEligibility || isJoining || !preview}
            onClick={handleJoin}
            className="mt-5 w-full rounded-2xl bg-gradient-gold py-3.5 font-display text-sm font-semibold text-gold-foreground disabled:opacity-50"
          >
            {isJoining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Joining
              </span>
            ) : eligible ? "Join Circle" : "Sign in to join"}
          </button>
          <p className="mt-3 text-[10px] text-primary-foreground/60">Only join circles from people you trust.</p>
        </div>

        {joinError && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{joinError}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-[11px] font-medium">{success}</p>
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

function formatDate(value: string | null) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
