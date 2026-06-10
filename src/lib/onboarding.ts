import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, getUserVerification, type Profile, type UserVerification } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

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

  if (!verification?.ghana_card_verified) {
    issues.push({
      key: "ghana_card",
      message: "Ghana Card verification is not verified.",
      actionLabel: "Verify Ghana Card",
      to: "/verify/ghana-card",
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

  if (!profile.profile_completed) {
    issues.push({
      key: "profile",
      message: "Your user profile is not complete.",
      actionLabel: "Complete profile",
      to: "/profile",
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

function blocked(userId: string | null, issues: EligibilityIssue[]): CircleEligibility {
  return {
    isEligible: false,
    userId,
    issues,
    message: issues.map((issue) => issue.message).join(" "),
  };
}
