import { getCurrentUser } from "@/lib/auth";
import { getCurrentUserVerification, getProfileByUserId, type Profile, type UserVerification } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { buildVerificationSteps, faceStepStatus, ghanaCardStepStatus, hasAcceptedFaceVerification, hasAcceptedGhanaCardVerification, isUserFullyVerified, statusStep } from "@/lib/verification-flow";
import type { VerificationStatus } from "@/lib/supabase-types";

export type EligibilityIssue = {
  key: "ghana_card" | "phone" | "face" | "selfie" | "profile" | "account" | "auth" | "config";
  message: string;
  actionLabel: string;
  to: string;
};

export type CircleEligibility = {
  isEligible: boolean;
  userId: string | null;
  issues: EligibilityIssue[];
  message: string;
};

export type VerificationGateSummary = {
  isEligible: boolean;
  canUseCircleActions: boolean;
  formsComplete: boolean;
  message: string;
  nextStep: {
    to: string;
    label: string;
    description: string;
  };
  statuses: {
    phone: VerificationStatus;
    ghanaCard: VerificationStatus;
    face: VerificationStatus;
    profile: "complete" | "incomplete";
    account: "active" | "inactive";
  };
};

export async function getCircleEligibility(): Promise<CircleEligibility> {
  if (!isSupabaseConfigured) {
    return blocked(null, [{
      key: "config",
      message: "Supabase must be configured before circle access can be checked.",
      actionLabel: "Check setup",
      to: "/settings",
    }]);
  }

  const user = await getCurrentUser();
  if (!user) {
    return blocked(null, [{
      key: "auth",
      message: "Please sign in before creating or joining a circle.",
      actionLabel: "Sign in",
      to: "/login",
    }]);
  }

  const [{ data: profile, error }, verificationResult] = await Promise.all([
    getProfileByUserId(user.id),
    getCurrentUserVerification(),
  ]);
  const verification = verificationResult.data;

  const { data: allowed, error: rpcError } = await supabase.rpc("user_passes_circle_onboarding", {
    check_user_id: user.id,
  });

  console.log("circle_eligibility_verification_fetch", {
    currentUserId: user.id,
    verificationRecordFound: Boolean(verification),
    fetchedVerification: verification,
    rpcAllowed: allowed ?? null,
    rpcError: rpcError?.message ?? null,
  });

  if ((verification?.verification_status !== "verified") && (rpcError || !allowed)) {
    return blocked(user.id, [{
      key: "account",
      message: rpcError?.message ?? "Complete verification before creating or joining a circle.",
      actionLabel: "Continue verification",
      to: "/verify/status",
    }]);
  }

  if (error || !profile) {
    return { isEligible: true, userId: user.id, issues: [], message: "Verification complete. Circle actions are available." };
  }

  return { isEligible: true, userId: user.id, issues: [], message: "Verification complete. Circle actions are available." };
}

export function getProfileEligibilityIssues(profile: Profile, verification: UserVerification | null): EligibilityIssue[] {
  const issues: EligibilityIssue[] = [];

  if (!profile.profile_completed) {
    issues.push({
      key: "profile",
      message: "Your user profile is not complete.",
      actionLabel: "Complete profile",
      to: "/verify/profile",
    });
  }

  if (!verification?.phone_verified) {
    issues.push({
      key: "phone",
      message: "Phone OTP verification is not verified.",
      actionLabel: "Verify phone",
      to: "/verify/phone",
    });
  }

  if (!hasAcceptedGhanaCardVerification(verification)) {
    issues.push({
      key: "ghana_card",
      message: "Ghana Card verification has not been submitted or approved for review.",
      actionLabel: "Verify Ghana Card",
      to: "/verify/ghana-card",
    });
  }

  if (!verification?.selfie_uploaded) {
    issues.push({
      key: "selfie",
      message: "A selfie capture has not been submitted.",
      actionLabel: "Capture selfie",
      to: "/verify/selfie",
    });
  }

  if (!hasAcceptedFaceVerification(verification)) {
    issues.push({
      key: "face",
      message: "Face verification has not been submitted or approved for review.",
      actionLabel: "Verify face",
      to: "/verify/selfie",
    });
  }

  if (profile.account_status !== "active") {
    issues.push({
      key: "account",
      message: "Your account is not active. Contact support or review settings.",
      actionLabel: "Review account",
      to: "/settings",
    });
  }

  return issues;
}

export function getCircleAccessIssues(profile: Profile, verification: UserVerification | null): EligibilityIssue[] {
  const formIssues = getProfileEligibilityIssues(profile, verification);
  if (formIssues.length > 0) return formIssues;

  if (!isUserFullyVerified(profile, verification)) {
    return [{
      key: "account",
      message: "Verification submitted. Your account is under review.",
      actionLabel: "View status",
      to: "/verify/status",
    }];
  }

  return [];
}

export async function getVerificationGateSummary(): Promise<VerificationGateSummary> {
  if (!isSupabaseConfigured) {
    return emptyGateSummary(false);
  }

  const user = await getCurrentUser();
  if (!user) {
    return emptyGateSummary(false);
  }

  const [{ data: profile }, verificationResult] = await Promise.all([
    getProfileByUserId(user.id),
    getCurrentUserVerification(),
  ]);
  const verification = verificationResult.data;

  console.log("verification_gate_summary_fetch", {
    currentUserId: user.id,
    verificationFetchUserId: verificationResult.userId,
    verificationRecordFound: Boolean(verification),
    fetchedVerification: verification,
  });

  const steps = buildVerificationSteps(profile ?? null, verification ?? null);
  const formsComplete = steps.every((step) => step.accepted);
  const isEligible = formsComplete || verification?.verification_status === "verified";
  const canUseCircleActions = isEligible;
  const nextStep = steps.find((step) => !step.accepted) ?? statusStep(formsComplete);

  return {
    isEligible,
    canUseCircleActions,
    formsComplete,
    message: isEligible
      ? "Verification complete. You can create and join circles."
      : formsComplete
        ? "Verification forms complete. Waiting for admin approval."
        : nextStep.description,
    nextStep: {
      to: nextStep.to,
      label: nextStep.label,
      description: nextStep.description,
    },
    statuses: {
      phone: verification?.verification_status === "verified" || (verification?.phone_verified && verification.otp_status === "verified") ? "verified" : "not_started",
      ghanaCard: ghanaCardStepStatus(verification ?? null),
      face: faceStepStatus(verification ?? null),
      profile: profile?.profile_completed || verification?.verification_status === "verified" ? "complete" : "incomplete",
      account: profile?.account_status === "active" || verification?.verification_status === "verified" ? "active" : "inactive",
    },
  };
}

function emptyGateSummary(isEligible: boolean): VerificationGateSummary {
  const nextStep = isEligible ? statusStep(true) : buildVerificationSteps(null, null)[0];
  return {
    isEligible,
    canUseCircleActions: isEligible,
    formsComplete: false,
    message: isEligible ? "Verification approved. You can create and join circles." : nextStep.description,
    nextStep: {
      to: nextStep.to,
      label: nextStep.label,
      description: nextStep.description,
    },
    statuses: {
      phone: "not_started",
      ghanaCard: "not_started",
      face: "not_started",
      profile: "incomplete",
      account: "inactive",
    },
  };
}

function blocked(userId: string | null, issues: EligibilityIssue[]): CircleEligibility {
  return {
    isEligible: false,
    userId,
    issues,
    message: issues.map((issue) => issue.message).join(" "),
  };
}
