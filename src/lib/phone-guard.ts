import { redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentUserVerification } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function requireVerifiedPhone() {
  if (!isSupabaseConfigured) return;

  const user = await getCurrentUser();
  if (!user) {
    throw redirect({ to: "/login" });
  }

  const { data, error } = await getCurrentUserVerification();
  console.log("phone_guard_verification_fetch", {
    currentUserId: user.id,
    verificationRecordFound: Boolean(data),
    fetchedVerification: data,
    error: error?.message ?? null,
  });

  if (error || !(data?.phone_verified && data.otp_status === "verified") && data?.verification_status !== "verified") {
    throw redirect({ to: "/verify/phone" });
  }
}

export async function requireAuth(returnTo?: string) {
  if (!isSupabaseConfigured) return;

  const user = await getCurrentUser();
  if (!user) {
    const search = returnTo ? { redirect: returnTo } : undefined;
    throw redirect({ to: "/login", search });
  }
}
