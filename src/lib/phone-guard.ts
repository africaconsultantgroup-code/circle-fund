import { redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/lib/auth";
import { getUserVerification } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function requireVerifiedPhone() {
  if (!isSupabaseConfigured) return;

  const user = await getCurrentUser();
  if (!user) {
    throw redirect({ to: "/login" });
  }

  const { data, error } = await getUserVerification(user.id);
  if (error || !data?.phone_verified || data.otp_status !== "verified") {
    throw redirect({ to: "/verify/phone" });
  }
}

export async function requireAuth() {
  if (!isSupabaseConfigured) return;

  const user = await getCurrentUser();
  if (!user) {
    throw redirect({ to: "/login" });
  }
}
