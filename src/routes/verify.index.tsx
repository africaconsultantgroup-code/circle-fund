import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Phone, IdCard, ScanFace, Smartphone, UserCheck, ArrowRight, X } from "lucide-react";
import { verification, verificationProgress } from "@/lib/mock-data";
import { VerificationBadge } from "@/components/verification-badge";

export const Route = createFileRoute("/verify")({
  component: VerifyWelcome,
});

const steps = [
  { to: "/verify/phone", icon: Phone, title: "Phone number", desc: "We send a one-time code by SMS", key: "phone" as const },
  { to: "/verify/ghana-card", icon: IdCard, title: "Ghana Card", desc: "Upload front and back of your ID", key: "ghanaCard" as const },
  { to: "/verify/selfie", icon: ScanFace, title: "Selfie match", desc: "Quick face check vs. your Ghana Card", key: "selfie" as const },
  { to: "/verify/momo", icon: Smartphone, title: "Mobile Money", desc: "Confirm the MoMo wallet you'll use", key: "momo" as const },
  { to: "/verify/guarantor", icon: UserCheck, title: "Risk profile & guarantor", desc: "Income, employment and a guarantor", key: "guarantor" as const },
];

function VerifyWelcome() {
  const p = verificationProgress(verification);
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="relative bg-gradient-card px-5 pt-12 pb-10 text-primary-foreground">
        <Link to="/home" className="absolute right-4 top-12 flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
          <X className="h-4 w-4" />
        </Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
          <ShieldCheck className="h-6 w-6 text-gold" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Get verified to start saving</h1>
        <p className="mt-2 text-sm text-primary-foreground/75">SikaCircle protects every cedi with multi-step verification. Complete all steps to create or join a susu circle.</p>
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] text-primary-foreground/70">
            <span>{p.done} of {p.total} complete</span><span>{p.percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${p.percent}%` }} />
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-3 px-5 pt-5">
        {steps.map(({ to, icon: Icon, title, desc, key }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-sm font-semibold">{title}</p>
                  <VerificationBadge status={verification[key === "guarantor" ? "guarantor" : key]} />
                </div>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-auto px-5 py-6 text-center text-[11px] text-muted-foreground">
        Your documents are encrypted and used only for KYC. We never share data with third parties without consent.
      </p>
    </div>
  );
}