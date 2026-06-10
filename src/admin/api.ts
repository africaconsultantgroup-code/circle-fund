import { supabase } from "@/lib/supabase";

export type AdminUserVerification = {
  user_id: string;
  phone_verified: boolean;
  ghana_card_verified: boolean;
  face_verified: boolean;
  selfie_uploaded: boolean;
  verification_status: string;
  provider_reference: string | null;
  verified_at: string | null;
  updated_at: string | null;
};

export type AdminUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: string;
  accountStatus: string;
  profileCompleted: boolean;
  createdAt: string | null;
  verification: AdminUserVerification | null;
};

export async function listAdminUsers() {
  return supabase.functions.invoke<{ users: AdminUser[] }>("admin-list-users");
}

export async function markTestUserVerified(userId: string, adminSecret: string) {
  return supabase.functions.invoke<{ status: string; providerReference: string }>("admin-mark-test-user-verified", {
    body: { userId },
    headers: {
      "x-admin-verification-secret": adminSecret,
    },
  });
}
