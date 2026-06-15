import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const CIRCLE_ADMIN_LIMIT_MESSAGE = "You can only administer 2 active susu groups at a time.";
export const CAPACITY_REVIEW_MESSAGE = "You are already in 3 active susu groups. SikaCircle must review your capacity before approving another group.";

export type CreateCircleLimitResult = {
  userId: string | null;
  canCreate: boolean;
  activeAdminCount: number;
  message: string;
};

export type JoinCircleLimitResult = {
  userId: string | null;
  canJoin: boolean;
  requiresCapacityReview: boolean;
  activeCircleCount: number;
  message: string;
};

export async function canCreateCircle(userId?: string | null, logBlock = false): Promise<CreateCircleLimitResult> {
  const resolvedUserId = userId ?? (await getCurrentUser())?.id ?? null;
  if (!resolvedUserId) {
    return {
      userId: null,
      canCreate: false,
      activeAdminCount: 0,
      message: "Please sign in before creating a circle.",
    };
  }

  const { data, error } = await supabase.rpc("can_create_circle", {
    check_user_id: resolvedUserId,
    log_block: logBlock,
  });

  if (error) {
    return {
      userId: resolvedUserId,
      canCreate: false,
      activeAdminCount: 0,
      message: error.message || CIRCLE_ADMIN_LIMIT_MESSAGE,
    };
  }

  const row = data?.[0];
  return {
    userId: resolvedUserId,
    canCreate: Boolean(row?.can_create),
    activeAdminCount: Number(row?.active_admin_count ?? 0),
    message: row?.message ?? (row?.can_create ? "Circle creation allowed." : CIRCLE_ADMIN_LIMIT_MESSAGE),
  };
}

export async function canJoinCircle(circleId: string, userId?: string | null, logReview = false): Promise<JoinCircleLimitResult> {
  const resolvedUserId = userId ?? (await getCurrentUser())?.id ?? null;
  if (!resolvedUserId) {
    return {
      userId: null,
      canJoin: false,
      requiresCapacityReview: false,
      activeCircleCount: 0,
      message: "Please sign in before joining a circle.",
    };
  }

  const { data, error } = await supabase.rpc("can_join_circle", {
    check_user_id: resolvedUserId,
    check_circle_id: circleId,
    log_review: logReview,
  });

  if (error) {
    return {
      userId: resolvedUserId,
      canJoin: false,
      requiresCapacityReview: false,
      activeCircleCount: 0,
      message: error.message || "We could not check your circle capacity.",
    };
  }

  const row = data?.[0];
  return {
    userId: resolvedUserId,
    canJoin: Boolean(row?.can_join),
    requiresCapacityReview: Boolean(row?.requires_capacity_review),
    activeCircleCount: Number(row?.active_circle_count ?? 0),
    message: row?.message ?? (row?.requires_capacity_review ? CAPACITY_REVIEW_MESSAGE : "Join request allowed."),
  };
}
