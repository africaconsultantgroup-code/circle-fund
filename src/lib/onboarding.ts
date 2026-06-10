import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, getUserVerification, type Profile, type UserVerification } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { buildVerificationSteps, statusStep } from "@/lib/verification-flow";

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
  message: string;
  nextStep: {
    to: string;
    label: string;
    description: string;
  };
  statuses: {
    phone: "verified" | "not_started";
    ghanaCard: "verified" | "not_started";
    face: "verified" | "not_started";
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

  const { data: profile, error } = await getProfileByUserId(user.id);
  if (error || !profile) {
    return blocked(user.id, [{
      key: "profile",
      message: "Complete your profile before creating or joining a circle.",
      actionLabel: "Complete profile",
      to: "/profile",
    }]);
  }

  const { data: verification } = await getUserVerification(user.id);
  const issues = getProfileEligibilityIssues(profile, verification);
  if (issues.length > 0) {
    return blocked(user.id, issues);
  }

  const { data: allowed, error: rpcError } = await supabase.rpc("user_passes_circle_onboarding", {
    check_user_id: user.id,
  });

  if (rpcError || !allowed) {
    return blocked(user.id, [{
      key: "profile",
      message: rpcError?.message ?? "Your onboarding checks could not be verified.",
      actionLabel: "Review onboarding",
      to: "/verify",
    }]);
  }

  return { isEligible: true, userId: user.id, issues: [], message: "" };
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

  if (!verification?.ghana_card_verified) {
    issues.push({
      key: "ghana_card",
      message: "Ghana Card verification is not verified.",
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

  if (!verification?.face_verified) {
    issues.push({
      key: "face",
      message: "Face verification is not verified.",
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

export async function getVerificationGateSummary(): Promise<VerificationGateSummary> {
  if (!isSupabaseConfigured) {
    return emptyGateSummary(false);
  }

  const user = await getCurrentUser();
  if (!user) {
    return emptyGateSummary(false);
  }

  const [{ data: profile }, { data: verification }] = await Promise.all([
    getProfileByUserId(user.id),
    getUserVerification(user.id),
  ]);

  const isEligible = Boolean(
    profile &&
    verification?.phone_verified &&
    verification.ghana_card_verified &&
    verification.face_verified &&
    profile.profile_completed &&
    profile.account_status === "active",
  );
  const steps = buildVerificationSteps(profile ?? null, verification ?? null);
  const nextStep = steps.find((step) => step.status !== "verified") ?? statusStep(isEligible);

  return {
    isEligible,
    message: isEligible ? "Verification complete. You can create and join circles." : nextStep.description,
    nextStep: {
      to: nextStep.to,
      label: nextStep.label,
      description: nextStep.description,
    },
    statuses: {
      phone: verification?.phone_verified ? "verified" : "not_started",
      ghanaCard: verification?.ghana_card_verified ? "verified" : "not_started",
      face: verification?.face_verified ? "verified" : "not_started",
      profile: profile?.profile_completed ? "complete" : "incomplete",
      account: profile?.account_status === "active" ? "active" : "inactive",
    },
  };
}

function emptyGateSummary(isEligible: boolean): VerificationGateSummary {
  const nextStep = isEligible ? statusStep(true) : buildVerificationSteps(null, null)[0];
  return {
    isEligible,
    message: isEligible ? "Verification complete. You can create and join circles." : nextStep.description,
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
