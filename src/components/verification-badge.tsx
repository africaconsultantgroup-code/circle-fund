import { ShieldCheck, ShieldAlert, ShieldQuestion, Clock, Sparkles } from "lucide-react";
import type { VerificationStatus, TrustTier } from "@/lib/mock-data";

export function VerificationBadge({ status, label }: { status: VerificationStatus; label?: string }) {
  const map = {
    verified: { cls: "bg-success/15 text-success", Icon: ShieldCheck, text: label ?? "Verified" },
    pending: { cls: "bg-gold/20 text-[color:var(--gold-foreground)]", Icon: Clock, text: label ?? "Pending" },
    unverified: { cls: "bg-muted text-muted-foreground", Icon: ShieldQuestion, text: label ?? "Unverified" },
    rejected: { cls: "bg-destructive/15 text-destructive", Icon: ShieldAlert, text: label ?? "Rejected" },
  } as const;
  const { cls, Icon, text } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <Icon className="h-3 w-3" /> {text}
    </span>
  );
}

export function TrustBadge({ tier, score }: { tier: TrustTier; score?: number }) {
  const map = {
    high: { cls: "bg-success text-success-foreground", Icon: Sparkles, text: "High Trust" },
    medium: { cls: "bg-gradient-primary text-primary-foreground", Icon: ShieldCheck, text: "Trusted" },
    low: { cls: "bg-destructive text-destructive-foreground", Icon: ShieldAlert, text: "Risk Alert" },
    new: { cls: "bg-secondary text-primary", Icon: ShieldQuestion, text: "New Member" },
  } as const;
  const { cls, Icon, text } = map[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" /> {text}{score !== undefined && <span className="opacity-80">· {score}</span>}
    </span>
  );
}