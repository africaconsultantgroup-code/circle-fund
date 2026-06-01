import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, CreditCard, HelpCircle, LogOut, Settings as SettingsIcon, Shield, FileText, ShieldCheck, AlertTriangle } from "lucide-react";
import { circles, currentUser, formatGHS, trustScore, verification, verificationProgress } from "@/lib/mock-data";
import { TrustBadge } from "@/components/verification-badge";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

const items = [
  { icon: ShieldCheck, label: "Verification", to: "/verify" },
  { icon: Shield, label: "Trust score", to: "/trust-score" },
  { icon: AlertTriangle, label: "Risk alerts", to: "/risk-alert" },
  { icon: SettingsIcon, label: "Settings", to: "/settings" },
  { icon: CreditCard, label: "Payment methods", to: "/settings" },
  { icon: FileText, label: "Transaction history", to: "/transactions" },
  { icon: HelpCircle, label: "Help & support", to: "/settings" },
] as const;

function ProfilePage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col">
      <div className="bg-gradient-card px-5 pt-12 pb-20 text-primary-foreground">
        <h1 className="font-display text-2xl font-bold tracking-tight">Profile</h1>
      </div>

      <div className="-mt-14 px-5">
        <div className="rounded-3xl bg-card p-5 shadow-elevated">
          <div className="flex items-center gap-4">
            <img src={currentUser.avatar} className="h-16 w-16 rounded-2xl border-2 border-secondary bg-white" alt="" />
            <div className="flex-1">
              <p className="font-display text-base font-semibold">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser.email}</p>
              <p className="text-[11px] text-muted-foreground">Member since {currentUser.joined}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <TrustBadge tier={trustScore.tier} score={trustScore.score} />
            <Link to="/verify" className="text-[11px] font-semibold text-primary">
              {verificationProgress(verification).done}/{verificationProgress(verification).total} verified
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-border">
            <Mini label="Circles" value={circles.length} />
            <Mini label="Saved" value={formatGHS(6850)} />
            <Mini label="Cycles" value={8} />
          </div>
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-2 px-5">
        {items.map(({ icon: Icon, label, to }) => (
          <li key={label}>
            <Link to={to} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
        <li>
          <button
            onClick={() => navigate({ to: "/login" })}
            className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-destructive"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
              <LogOut className="h-5 w-5" />
            </span>
            <span className="flex-1 text-left text-sm font-medium">Sign out</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <p className="font-display text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}