import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Phone, IdCard, ScanFace, ArrowRight, X, UserRound } from "lucide-react";
import { VerificationBadge } from "@/components/verification-badge";
import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, getUserVerification, type Profile, type UserVerification } from "@/lib/db";
import type { VerificationStatus } from "@/lib/supabase-types";

export const Route = createFileRoute("/verify")({
  component: VerifyWelcome,
});

type Step = {
  to: string;
  icon: typeof Phone;
  title: string;
  desc: string;
  status: VerificationStatus;
};

function VerifyWelcome() {
  const [verification, setVerification] = useState<UserVerification | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let isMounted = true;

    getCurrentUser().then(async (user) => {
      if (!user) return;
      const [{ data: verificationData }, { data: profileData }] = await Promise.all([
        getUserVerification(user.id),
        getProfileByUserId(user.id),
      ]);
      if (!isMounted) return;
      setVerification(verificationData ?? null);
      setProfile(profileData ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const steps: Step[] = [
    { to: "/verify/phone", icon: Phone, title: "Phone number", desc: "Request and confirm an OTP through the secure backend", status: boolStatus(verification?.phone_verified, verification) },
    { to: "/verify/ghana-card", icon: IdCard, title: "Ghana Card", desc: "Submit your card number to the secure provider function", status: boolStatus(verification?.ghana_card_verified, verification) },
    { to: "/verify/selfie", icon: ScanFace, title: "Face match", desc: "Capture a selfie reference for provider face matching", status: boolStatus(verification?.face_verified, verification) },
    { to: "/profile", icon: UserRound, title: "Profile", desc: "Complete your name and required account details", status: profile?.profile_completed ? "verified" : "not_started" },
  ];
  const done = steps.filter((step) => step.status === "verified").length;
  const percent = Math.round((done / steps.length) * 100);

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
        <p className="mt-2 text-sm text-primary-foreground/75">Verification requests are processed through secure backend functions. Provider keys are never exposed in the app.</p>
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] text-primary-foreground/70">
            <span>{done} of {steps.length} complete</span><span>{percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-gold" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-3 px-5 pt-5">
        {steps.map(({ to, icon: Icon, title, desc, status }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-sm font-semibold">{title}</p>
                  <VerificationBadge status={status} />
                </div>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-auto px-5 py-6 text-center text-[11px] text-muted-foreground">
        SikaCircle stores only status, references, timestamps, and minimal metadata required for verification.
      </p>
    </div>
  );
}

function boolStatus(value: boolean | undefined, verification: UserVerification | null): VerificationStatus {
  if (value) return "verified";
  return verification?.verification_status ?? "not_started";
}
