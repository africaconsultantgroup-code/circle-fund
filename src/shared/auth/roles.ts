import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId } from "@/lib/db";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { StaffRole, UserRole } from "@/lib/supabase-types";

const staffRoles: StaffRole[] = ["super_admin", "operations", "compliance", "finance", "support"];

export async function getCurrentUserRole(): Promise<UserRole | null> {
  if (!isSupabaseConfigured) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await getProfileByUserId(user.id);
  if (error || !data) return null;

  return data.role;
}

export async function currentUserIsAdmin() {
  if (!isSupabaseConfigured) return false;

  const { data, error } = await supabase.rpc("current_user_is_admin");
  if (error) return false;

  if (data) return true;

  const { data: bootstrapData, error: bootstrapError } = await supabase.rpc("bootstrap_current_user_admin");
  if (bootstrapError) return false;

  const bootstrapped = Array.isArray(bootstrapData) && bootstrapData.some((row) => isStaffRole(row.role) && row.account_status === "active");
  if (bootstrapped) return true;

  return false;
}

export async function getCurrentStaffRole(): Promise<StaffRole | null> {
  const role = await getCurrentUserRole();
  if (isStaffRole(role)) return role;

  const { data: bootstrapData, error: bootstrapError } = await supabase.rpc("bootstrap_current_user_admin");
  if (bootstrapError) return null;

  const bootstrapped = Array.isArray(bootstrapData)
    ? bootstrapData.find((row) => isStaffRole(row.role) && row.account_status === "active")
    : null;

  return bootstrapped && isStaffRole(bootstrapped.role) ? bootstrapped.role : null;
}

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return staffRoles.includes(role as StaffRole);
}
