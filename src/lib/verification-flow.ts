import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, getUserVerification, type Profile, type UserVerification } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { VerificationStatus } from "@/lib/supabase-types";

export type VerificationStepKey = "profile" | "phone" | "ghana_card" | "selfie" | "account" | "status";

export type VerificationStepSummary = {
  key: VerificationStepKey;
  to: string;
  label: string;
  description: string;
  status: VerificationStatus;
  accepted: boolean;
};

export type VerificationFlowSummary = {
  userId: string | null;
  profile: Profile | null;
  verification: UserVerification | null;
  steps: VerificationStepSummary[];
  nextStep: VerificationStepSummary;
  isComplete: boolean;
  isFullyVerified: boolean;
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
  const completedCount = steps.filter((step) => step.accepted).length;
  const isComplete = completedCount === steps.length;
  const isFullyVerified = isUserFullyVerified(profile ?? null, verification ?? null);
  const nextStep = steps.find((step) => !step.accepted) ?? statusStep(isComplete);

  return {
    userId: user.id,
    profile: profile ?? null,
    verification: verification ?? null,
    steps,
    nextStep,
    isComplete,
    isFullyVerified,
    completedCount,
    percent: Math.round((completedCount / steps.length) * 100),
    error: profileError?.message ?? verificationError?.message ?? null,
  };
}

export function buildVerificationSteps(profile: Profile | null, verification: UserVerification | null): VerificationStepSummary[] {
  const profileAccepted = Boolean(profile?.profile_completed);
  const phoneAccepted = Boolean(verification?.phone_verified && verification.otp_status === "verified");
  const ghanaCardAccepted = hasAcceptedGhanaCardVerification(verification);
  const faceAccepted = hasAcceptedFaceVerification(verification);
  const accountAccepted = profile?.account_status === "active";

  return [
    {
      key: "profile",
      to: "/verify/profile",
      label: "Profile completion",
      description: "Add your name and contact details.",
      status: profileAccepted ? "verified" : "not_started",
      accepted: profileAccepted,
    },
    {
      key: "phone",
      to: "/verify/phone",
      label: "Phone OTP",
      description: "Submit your phone number and OTP request.",
      status: phoneAccepted ? "verified" : phoneStatus(Boolean(profile?.phone), verification),
      accepted: phoneAccepted,
    },
    {
      key: "ghana_card",
      to: "/verify/ghana-card",
      label: "Ghana Card",
      description: "Submit your Ghana Card number for review.",
      status: ghanaCardStepStatus(verification),
      accepted: ghanaCardAccepted,
    },
    {
      key: "selfie",
      to: "/verify/selfie",
      label: "Selfie / face match",
      description: "Capture or upload a selfie reference.",
      status: faceStepStatus(verification),
      accepted: faceAccepted,
    },
    {
      key: "account",
      to: "/verify/status",
      label: "Account status",
      description: "Your account must be active.",
      status: accountAccepted ? "verified" : "not_started",
      accepted: accountAccepted,
    },
  ];
}

export function statusStep(isComplete: boolean): VerificationStepSummary {
  return {
    key: "status",
    to: "/verify/status",
    label: isComplete ? "Verification submitted" : "Verification status",
    description: isComplete ? "Review your verification status." : "Review pending and missing verification steps.",
    status: isComplete ? "verified" : "manual_review",
    accepted: isComplete,
  };
}

export function hasAcceptedGhanaCardVerification(verification: UserVerification | null) {
  return Boolean(
    verification?.ghana_card_verified ||
    (verification?.ghana_card_number_hash && reviewStatusAllowsEligibility(stepStatusOrAggregate(verification.ghana_card_status, verification.verification_status))),
  );
}

export function hasAcceptedFaceVerification(verification: UserVerification | null) {
  return Boolean(
    verification?.face_verified ||
    (verification?.selfie_uploaded && reviewStatusAllowsEligibility(stepStatusOrAggregate(verification.face_status, verification.verification_status))),
  );
}

export function ghanaCardStepStatus(verification: UserVerification | null): VerificationStatus {
  if (verification?.ghana_card_verified) return "verified";
  return submittedStatus(
    Boolean(verification?.ghana_card_number_hash),
    stepStatusOrAggregate(verification?.ghana_card_status, verification?.verification_status),
  );
}

export function faceStepStatus(verification: UserVerification | null): VerificationStatus {
  if (verification?.face_verified) return "verified";
  return submittedStatus(
    Boolean(verification?.selfie_uploaded),
    stepStatusOrAggregate(verification?.face_status, verification?.verification_status),
  );
}

function reviewStatusAllowsEligibility(status: VerificationStatus | null | undefined) {
  return status === "verified" || status === "manual_review" || status === "pending";
}

export function isUserFullyVerified(profile: Profile | null, verification: UserVerification | null) {
  return Boolean(
    profile?.profile_completed &&
    profile.account_status === "active" &&
    verification?.phone_verified &&
    verification.otp_status === "verified" &&
    verification.ghana_card_verified &&
    verification.face_verified &&
    verification.verification_status === "verified",
  );
}

function phoneStatus(hasPhoneSubmission: boolean, verification: UserVerification | null): VerificationStatus {
  if (verification?.phone_verified) return "verified";
  if (!hasPhoneSubmission) return "not_started";
  if (verification?.verification_status === "failed") return "failed";
  return verification?.verification_status === "not_started" ? "not_started" : "pending";
}

function submittedStatus(hasSubmission: boolean, status: VerificationStatus | null | undefined): VerificationStatus {
  if (!hasSubmission) return "not_started";
  if (status === "failed") return "failed";
  if (status === "verified") return "verified";
  if (status === "manual_review") return "manual_review";
  return "pending";
}

function stepStatusOrAggregate(stepStatus: VerificationStatus | null | undefined, aggregateStatus: VerificationStatus | null | undefined) {
  return stepStatus && stepStatus !== "not_started" ? stepStatus : aggregateStatus;
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
    isFullyVerified: false,
    completedCount: 0,
    percent: 0,
    error,
  };
}
