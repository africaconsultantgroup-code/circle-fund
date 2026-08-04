import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, CreditCard, FileText, HelpCircle, Loader2, LogOut, Settings as SettingsIcon, Shield, ShieldCheck, Wallet } from "lucide-react";
import { TrustBadge } from "@/components/verification-badge";
import { getCurrentUser, getCurrentUserProfile, signOut, type UserProfile } from "@/lib/auth";
import { getCustomerFinancialSummary, getCustomerReceivedSummary, type CustomerFinancialSummary, type CustomerReceivedSummary } from "@/lib/db";
import { formatCurrency } from "@/lib/diaspora";
import { loadUserCircles } from "@/lib/user-circles";
import type { CurrencyCode } from "@/lib/supabase-types";

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [circleCount, setCircleCount] = useState(0);
  const [financialSummary, setFinancialSummary] = useState<CustomerFinancialSummary | null>(null);
  const [receivedSummary, setReceivedSummary] = useState<CustomerReceivedSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const user = await getCurrentUser();
      if (!user) {
        if (!mounted) return;
        setError("Please sign in to view your profile.");
        setIsLoading(false);
        return;
      }

      const [profileResult, circleResult, financialResult, receivedResult] = await Promise.all([
        getCurrentUserProfile(),
        loadUserCircles(),
        getCustomerFinancialSummary(),
        getCustomerReceivedSummary(),
      ]);

      if (!mounted) return;
      setProfile(profileResult);
      setCircleCount(circleResult.data.length);
      setFinancialSummary(financialResult.data);
      setReceivedSummary(receivedResult.data);
      setError(circleResult.error ?? financialResult.error?.message ?? receivedResult.error?.message ?? "");
      setIsLoading(false);
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const currency = (financialSummary?.currency ?? receivedSummary?.currency ?? "GHS") as CurrencyCode;
  const displayName = profile?.full_name || profile?.email || "SikaCircle member";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SC";

  const handleLogout = async () => {
    await signOut();
    void navigate({ to: "/login" });
  };

  return (
    <div className="flex flex-col">
      <div className="bg-gradient-card px-5 pb-20 pt-12 text-primary-foreground">
        <h1 className="font-display text-2xl font-bold tracking-tight">Profile</h1>
      </div>

      <div className="-mt-14 px-5">
        <div className="rounded-3xl bg-card p-5 shadow-elevated">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading profile
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-secondary bg-gradient-primary font-display text-lg font-bold text-primary-foreground">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile?.email ?? "No email on file"}</p>
                  <p className="text-[11px] text-muted-foreground">Member since {formatDate(profile?.created_at)}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <TrustBadge tier="high" score={100} />
                <Link to="/verify/status" className="text-[11px] font-semibold text-primary">
                  Verification status
                </Link>
              </div>
              <div className="mt-5 grid grid-cols-3 divide-x divide-border">
                <Mini label="Circles" value={circleCount} />
                <Mini label="Total Paid" value={formatCurrency(Number(financialSummary?.total_paid ?? 0), currency)} />
                <Mini label="Received" value={formatCurrency(Number(receivedSummary?.total_received ?? financialSummary?.total_received ?? 0), currency)} />
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="mx-5 mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      <section className="mt-5 px-5">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="h-4 w-4" />
            <h2 className="font-display text-sm font-semibold">Financial summary</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Money label="Total Paid" value={formatCurrency(Number(financialSummary?.total_paid ?? 0), currency)} />
            <Money label="Susu Contributions" value={formatCurrency(Number(financialSummary?.susu_contributions ?? 0), currency)} />
            <Money label="Piggy Savings" value={formatCurrency(Number(financialSummary?.piggy_savings ?? 0), currency)} />
            <Money label="Wallet Deposits" value={formatCurrency(Number(financialSummary?.wallet_deposits ?? 0), currency)} />
            <Money label="Total Received" value={formatCurrency(Number(financialSummary?.total_received ?? 0), currency)} />
            <Money label="Expected Payout" value={formatCurrency(Number(financialSummary?.expected_payout_total ?? 0), currency)} />
            <Money label="Pending Payments" value={formatCurrency(Number(financialSummary?.pending_payments ?? 0), currency)} />
          </div>
        </div>
      </section>

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
            onClick={handleLogout}
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
    <div className="flex min-w-0 flex-col items-center px-2 text-center">
      <p className="max-w-full truncate font-display text-sm font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
