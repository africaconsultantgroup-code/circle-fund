import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Bell, Fingerprint, Globe, Lock, Moon, ChevronRight, CreditCard, HelpCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Settings" back="/profile" />
      <div className="flex flex-col gap-5 p-5">
        <Group title="Preferences">
          <Toggle icon={<Bell className="h-4 w-4" />} label="Push notifications" defaultOn />
          <Toggle icon={<Moon className="h-4 w-4" />} label="Dark mode" />
          <Row icon={<Globe className="h-4 w-4" />} label="Language" value="English" />
          <Row icon={<CreditCard className="h-4 w-4" />} label="Default currency" value="GHS" />
        </Group>

        <Group title="Security">
          <Toggle icon={<Fingerprint className="h-4 w-4" />} label="Biometric login" defaultOn />
          <Row icon={<Lock className="h-4 w-4" />} label="Change password" />
          <Row icon={<Lock className="h-4 w-4" />} label="Two-factor authentication" value="Off" />
        </Group>

        <Group title="Support">
          <Row icon={<HelpCircle className="h-4 w-4" />} label="Help center" />
          <Row icon={<HelpCircle className="h-4 w-4" />} label="Contact support" />
          <Row icon={<HelpCircle className="h-4 w-4" />} label="About SikaCircle" value="v1.0.0" />
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <button className="flex w-full items-center gap-3 border-b border-border px-4 py-3.5 last:border-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">{icon}</span>
      <span className="flex-1 text-left text-sm font-medium">{label}</span>
      {value && <span className="text-xs text-muted-foreground">{value}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function Toggle({ icon, label, defaultOn = false }: { icon: React.ReactNode; label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex w-full items-center gap-3 border-b border-border px-4 py-3.5 last:border-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">{icon}</span>
      <span className="flex-1 text-left text-sm font-medium">{label}</span>
      <button
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-gradient-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}