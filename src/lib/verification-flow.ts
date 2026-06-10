import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, getUserVerification, type Profile, type UserVerification } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { VerificationStatus } from "@/lib/supabase-types";

export type VerificationStepKey = "profile" | "phone" | "ghana_card" | "selfie" | "status";

export type VerificationStepSummary = {
  key: VerificationStepKey;
  to: string;
  label: string;
  description: string;
  status: VerificationStatus;
};

export type VerificationFlowSummary = {
  userId: string | null;
  profile: Profile | null;
  verification: UserVerification | null;
  steps: VerificationStepSummary[];
  nextStep: VerificationStepSummary;
  isComplete: boolean;
  completedCount: number;
  percent: number;
  error: string | null;
};

export async function loadVerificationFlowSummary(): Promise<VerificationFlowSummary> {
  if (!isSupabaseConfigured) {
    return emptySummary("Supabase must be configured before verification can start.");
  }

  const user = await getCurrentUser();
  if (!user) {
    return emptySummary("Please sign in to start verification.");
  }

  const [{ data: profile, error: profileError }, { data: verification, error: verificationError }] = await Promise.all([
    getProfileByUserId(user.id),
    getUserVerification(user.id),
  ]);

  const steps = buildVerificationSteps(profile ?? null, verification ?? null);
  const completedCount = steps.filter((step) => step.status === "verified").length;
  const isComplete = completedCount === steps.length;
  const nextStep = steps.find((step) => step.status !== "verified") ?? statusStep(isComplete);

  return {
    userId: user.id,
    profile: profile ?? null,
    verification: verification ?? null,
    steps,
    nextStep,
    isComplete,
    completedCount,
    percent: Math.round((completedCount / steps.length) * 100),
    error: profileError?.message ?? verificationError?.message ?? null,
  };
}

export function buildVerificationSteps(profile: Profile | null, verification: UserVerification | null): VerificationStepSummary[] {
  return [
    {
      key: "profile",
      to: "/verify/profile",
      label: "Profile completion",
      description: "Add your name and contact details.",
      status: profile?.profile_completed ? "verified" : "not_started",
    },
    {
      key: "phone",
      to: "/verify/phone",
      label: "Phone OTP",
      description: "Submit your phone number and OTP request.",
      status: verification?.phone_verified ? "verified" : submittedStatus(Boolean(profile?.phone), verification),
    },
    {
      key: "ghana_card",
      to: "/verify/ghana-card",
      label: "Ghana Card",
      description: "Submit your Ghana Card number for review.",
      status: verification?.ghana_card_verified ? "verified" : submittedStatus(Boolean(verification?.ghana_card_number_hash), verification),
    },
    {
      key: "selfie",
      to: "/verify/selfie",
      label: "Selfie / face match",
      description: "Capture or upload a selfie reference.",
      status: verification?.face_verified ? "verified" : submittedStatus(Boolean(verification?.selfie_uploaded), verification),
    },
  ];
}

export function statusStep(isComplete: boolean): VerificationStepSummary {
  return {
    key: "status",
    to: "/verify/status",
    label: isComplete ? "Verification complete" : "Verification status",
    description: isComplete ? "You can now create and join circles." : "Review pending and missing verification steps.",
    status: isComplete ? "verified" : "manual_review",
  };
}

function submittedStatus(hasSubmission: boolean, verification: UserVerification | null): VerificationStatus {
  if (!hasSubmission) return "not_started";
  if (verification?.verification_status === "failed") return "failed";
  return verification?.verification_status === "pending" ? "pending" : "manual_review";
}

function emptySummary(error: string): VerificationFlowSummary {
  const steps = buildVerificationSteps(null, null);
  return {
    userId: null,
    profile: null,
    verification: null,
    steps,
    nextStep: steps[0],
    isComplete: false,
    completedCount: 0,
    percent: 0,
    error,
  };
}
