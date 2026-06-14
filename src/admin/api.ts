import { supabase } from "@/lib/supabase";
import type { StaffRole, UserRole } from "@/lib/supabase-types";

export type AdminUserVerification = {
  user_id: string;
  phone_verified: boolean;
  ghana_card_verified: boolean;
  ghana_card_status?: string;
  face_verified: boolean;
  face_status?: string;
  selfie_uploaded: boolean;
  verification_provider: string | null;
  verification_status: string;
  is_test_verification: boolean;
  provider_reference: string | null;
  verified_at: string | null;
  updated_at: string | null;
};

export type AdminUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  preferredCurrency: string | null;
  role: string;
  accountStatus: string;
  profileCompleted: boolean;
  createdAt: string | null;
  verification: AdminUserVerification | null;
};

export type AdminMetrics = {
  totalUsers: number;
  verifiedUsers: number;
  pendingVerifications: number;
  suspendedUsers: number;
  totalCircles: number;
  activeCircles: number;
};

export type AdminCircle = {
  id: string;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  name: string;
  contributionAmount: number | null;
  baseCurrency: string | null;
  frequency: string | null;
  maxMembers: number;
  status: string;
  inviteCode: string | null;
  startDate: string | null;
  createdAt: string | null;
  memberCount: number;
  pendingMemberCount: number;
  totalMemberRows: number;
};

export type AdminAuditLog = {
  id: string;
  staff_user_id: string | null;
  staffName: string | null;
  staffEmail: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type StaffInvitation = {
  id: string;
  email: string;
  role: StaffRole;
  status: "pending" | "accepted" | "cancelled";
  invited_by: string | null;
  accepted_user_id: string | null;
  invited_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  metadata: Record<string, unknown>;
};

export type AdminOverview = {
  staffRole: string;
  metrics: AdminMetrics;
  users: AdminUser[];
  verifications: AdminUserVerification[];
  circles: AdminCircle[];
  circleMembers: Array<{
    id: string;
    circle_id: string;
    user_id: string;
    role: string;
    status: string;
    joined_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
  }>;
  auditLogs: AdminAuditLog[];
  staffInvitations: StaffInvitation[];
};

type AdminFunctionResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export async function listAdminUsers() {
  return invokeAdminFunction<{ users: AdminUser[] }>("admin-list-users");
}

export async function getAdminOverview() {
  return invokeAdminFunction<AdminOverview>("admin-overview");
}

export async function markTestUserVerified(userId: string, adminSecret: string) {
  return invokeAdminFunction<{ status: string; providerReference: string }>("admin-mark-test-user-verified", {
    method: "POST",
    body: { userId },
    headers: {
      "x-admin-verification-secret": adminSecret,
    },
  });
}

export async function updateAdminUserRole(userId: string, role: UserRole) {
  return invokeAdminFunction<{ userId: string; role: UserRole; status: string; staffRole: StaffRole }>("admin-update-user-role", {
    method: "POST",
    body: { userId, role },
  });
}

export async function manageStaff(action: "invite", payload: { email: string; role: StaffRole }) {
  return invokeAdminFunction<{ status: string; invitation?: StaffInvitation; matchedExistingUser?: boolean }>("admin-manage-staff", {
    method: "POST",
    body: { action, ...payload },
  });
}

export async function cancelStaffInvitation(invitationId: string) {
  return invokeAdminFunction<{ status: string; invitation: StaffInvitation }>("admin-manage-staff", {
    method: "POST",
    body: { action: "cancel_invitation", invitationId },
  });
}

export async function disableStaffAccount(userId: string) {
  return invokeAdminFunction<{ status: string; profile: { user_id: string; role: string; account_status: string } }>("admin-manage-staff", {
    method: "POST",
    body: { action: "disable_staff", userId },
  });
}

async function invokeAdminFunction<T>(functionName: string, options?: Parameters<typeof supabase.functions.invoke<T>>[1]): Promise<AdminFunctionResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, options);
    if (error) {
      const message = await describeFunctionError(functionName, error);
      console.error("[admin edge function error]", { functionName, error, message });
      return { data: null, error: { message } };
    }

    return { data, error: null };
  } catch (error) {
    const message = await describeFunctionError(functionName, error);
    console.error("[admin edge function exception]", { functionName, error, message });
    return { data: null, error: { message } };
  }
}

async function describeFunctionError(functionName: string, error: unknown) {
  const details: string[] = [];
  const errorLike = error as {
    name?: string;
    message?: string;
    context?: unknown;
    cause?: unknown;
  };

  if (errorLike.name) details.push(`type=${errorLike.name}`);
  if (errorLike.message) details.push(`message=${errorLike.message}`);

  if (errorLike.context instanceof Response) {
    details.push(`status=${errorLike.context.status} ${errorLike.context.statusText}`.trim());
    const body = await safeReadResponseBody(errorLike.context);
    if (body) details.push(`body=${body}`);
  } else if (errorLike.context) {
    details.push(`context=${safeStringify(errorLike.context)}`);
  }

  if (errorLike.cause) details.push(`cause=${safeStringify(errorLike.cause)}`);

  if (details.length === 0) {
    details.push(safeStringify(error));
  }

  return `Edge Function "${functionName}" failed. ${details.join(" | ")}`;
}

async function safeReadResponseBody(response: Response) {
  try {
    return await response.clone().text();
  } catch {
    return "";
  }
}

function safeStringify(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
