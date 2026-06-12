import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { getCircle, pendingApprovals, tierFromScore } from "@/lib/mock-data";
import { VerificationBadge, TrustBadge } from "@/components/verification-badge";
import { Check, X, Phone, IdCard, ScanFace, Smartphone, UserCheck } from "lucide-react";
import { requireVerifiedPhone } from "@/lib/phone-guard";

export const Route = createFileRoute("/circle/$id/approvals")({
  beforeLoad: requireVerifiedPhone,
  loader: ({ params }) => {
    const c = getCircle(params.id);
    if (!c) throw notFound();
    return c;
  },
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const c = Route.useLoaderData();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Member approvals" subtitle={c.name} back="/circles" />

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="rounded-3xl bg-gradient-card p-4 text-primary-foreground">
          <p className="text-[11px] uppercase tracking-wider text-primary-foreground/70">Pending requests</p>
          <p className="mt-1 font-display text-2xl font-bold">{pendingApprovals.length}</p>
          <p className="text-[11px] text-primary-foreground/70">Review verification & trust before approval.</p>
        </div>

        <ul className="flex flex-col gap-3">
          {pendingApprovals.map((a) => {
            const tier = tierFromScore(a.trustScore);
            return (
              <li key={a.id} className="rounded-3xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <img src={a.avatar} alt="" className="h-12 w-12 rounded-2xl bg-secondary" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-sm font-semibold">{a.name}</p>
                      <span className="text-[10px] text-muted-foreground">{a.appliedAt}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <TrustBadge tier={tier} score={a.trustScore} />
                      <span className="text-[11px] text-muted-foreground">· {a.activeCircles} active</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Mini icon={<Phone className="h-3 w-3" />} status={a.verification.phone} label="Phone" />
                  <Mini icon={<IdCard className="h-3 w-3" />} status={a.verification.ghanaCard} label="Card" />
                  <Mini icon={<ScanFace className="h-3 w-3" />} status={a.verification.selfie} label="Selfie" />
                  <Mini icon={<Smartphone className="h-3 w-3" />} status={a.verification.momo} label="MoMo" />
                  <Mini icon={<UserCheck className="h-3 w-3" />} status={a.verification.guarantor} label="Guarantor" />
                  <Mini icon={<UserCheck className="h-3 w-3" />} status={a.verification.riskProfile} label="Risk" />
                </div>

                {tier === "low" && (
                  <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
                    ⚠ Low trust score — approval not recommended for this circle value.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-2.5 text-sm font-medium text-destructive">
                    <X className="h-4 w-4" /> Decline
                  </button>
                  <button className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-card">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Mini({ icon, status, label }: { icon: React.ReactNode; status: any; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-2">
      <span className="text-muted-foreground">{icon}</span>
      <VerificationBadge status={status} label={label} />
    </div>
  );
}
