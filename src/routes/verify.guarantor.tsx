import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Briefcase, Wallet, UserCheck, PhoneCall } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/verify/guarantor")({
  component: GuarantorPage,
});

const employmentOptions = ["Employed", "Self-employed", "Business owner", "Student", "Unemployed"];
const incomeOptions = ["< GHS 1,000", "GHS 1,000 – 3,000", "GHS 3,000 – 6,000", "GHS 6,000 – 12,000", "> GHS 12,000"];

function GuarantorPage() {
  const navigate = useNavigate();
  const [employment, setEmployment] = useState("Employed");
  const [income, setIncome] = useState("GHS 3,000 – 6,000");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Risk profile" subtitle="Step 5 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <Card icon={<Briefcase className="h-4 w-4" />} title="Employment status">
          <div className="grid grid-cols-2 gap-2">
            {employmentOptions.map((o) => (
              <button
                key={o}
                onClick={() => setEmployment(o)}
                className={`rounded-2xl border px-3 py-3 text-xs font-medium ${
                  employment === o ? "border-primary bg-secondary text-primary" : "border-border bg-card"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </Card>

        <Card icon={<Wallet className="h-4 w-4" />} title="Monthly income">
          <div className="flex flex-col gap-2">
            {incomeOptions.map((o) => (
              <button
                key={o}
                onClick={() => setIncome(o)}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                  income === o ? "border-primary bg-secondary text-primary font-semibold" : "border-border bg-card"
                }`}
              >
                {o}
                <span className={`h-4 w-4 rounded-full border-2 ${income === o ? "border-primary bg-primary" : "border-border"}`} />
              </button>
            ))}
          </div>
        </Card>

        <Card icon={<PhoneCall className="h-4 w-4" />} title="Emergency contact">
          <Input label="Full name" defaultValue="Akua Mensah" />
          <Input label="Phone number" defaultValue="+233 20 444 0918" />
          <Input label="Relationship" defaultValue="Sister" />
        </Card>

        <Card icon={<UserCheck className="h-4 w-4" />} title="Guarantor">
          <p className="text-[11px] text-muted-foreground">A trusted adult who can vouch for you. They'll receive an SMS to confirm.</p>
          <Input label="Full name" defaultValue="Mr. Kofi Mensah" />
          <Input label="Phone number" defaultValue="+233 24 111 7788" />
        </Card>

        <button
          onClick={() => navigate({ to: "/trust-score" })}
          className="mt-2 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card"
        >
          Submit & view trust score
        </button>
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary">{icon}</span>
        <p className="font-display text-sm font-semibold">{title}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Input({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input defaultValue={defaultValue} className="mt-1 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3 text-sm outline-none" />
    </div>
  );
}