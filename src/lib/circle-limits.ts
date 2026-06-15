import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const CIRCLE_ADMIN_LIMIT_MESSAGE = "You can only administer 2 active susu groups at a time.";
export const CAPACITY_REVIEW_MESSAGE = "You are already in 3 active susu groups. SikaCircle must review your capacity before approving another group.";

export type CreateCircleLimitResult = {
  userId: string | null;
  canCreate: boolean;
  activeAdminCount: number;
  maxAdminCircles: number;
  message: string;
};

export type JoinCircleLimitResult = {
  userId: string | null;
  canJoin: boolean;
  requiresCapacityReview: boolean;
  activeCircleCount: number;
  maxCirclesWithoutReview: number;
  message: string;
};

export async function canCreateCircle(userId?: string | null, logBlock = false): Promise<CreateCircleLimitResult> {
  const resolvedUserId = userId ?? (await getCurrentUser())?.id ?? null;
  if (!resolvedUserId) {
    return {
      userId: null,
      canCreate: false,
      activeAdminCount: 0,
      maxAdminCircles: 2,
      message: "Please sign in before creating a circle.",
    };
  }

  const { data, error } = await supabase.rpc("can_create_circle", {
    check_user_id: resolvedUserId,
    log_block: logBlock,
  });

  if (error) {
    console.warn("can_create_circle_rpc_failed", { message: error.message, code: error.code });
    return fallbackCanCreateCircle(resolvedUserId);
  }

  const row = data?.[0];
  return {
    userId: resolvedUserId,
    canCreate: Boolean(row?.can_create),
    activeAdminCount: Number(row?.active_admin_count ?? 0),
    maxAdminCircles: Number(row?.max_admin_circles ?? 2),
    message: row?.reason ?? (row?.can_create ? "Circle creation allowed." : CIRCLE_ADMIN_LIMIT_MESSAGE),
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
      maxCirclesWithoutReview: 3,
      message: "Please sign in before joining a circle.",
    };
  }

  const { data, error } = await supabase.rpc("can_join_circle", {
    check_user_id: resolvedUserId,
    check_circle_id: circleId,
    log_block: logReview,
  });

  if (error) {
    console.warn("can_join_circle_rpc_failed", { message: error.message, code: error.code });
    return fallbackCanJoinCircle(circleId, resolvedUserId);
  }

  const row = data?.[0];
  return {
    userId: resolvedUserId,
    canJoin: Boolean(row?.can_join),
    requiresCapacityReview: Boolean(row?.requires_capacity_review),
    activeCircleCount: Number(row?.active_circle_count ?? 0),
    maxCirclesWithoutReview: Number(row?.max_circles_without_review ?? 3),
    message: row?.reason ?? (row?.requires_capacity_review ? CAPACITY_REVIEW_MESSAGE : "Join request allowed."),
  };
}

async function fallbackCanCreateCircle(userId: string): Promise<CreateCircleLimitResult> {
  const { data, error } = await supabase.rpc("user_active_circle_admin_count", { check_user_id: userId });
  const activeAdminCount = Number(data ?? 0);
  const canCreate = !error && activeAdminCount < 2;

  return {
    userId,
    canCreate,
    activeAdminCount,
    maxAdminCircles: 2,
    message: error
      ? "We could not check your circle creation limit. Please try again."
      : canCreate
        ? "Circle creation allowed."
        : CIRCLE_ADMIN_LIMIT_MESSAGE,
  };
}

async function fallbackCanJoinCircle(circleId: string, userId: string): Promise<JoinCircleLimitResult> {
  const [membershipResult, capacityResult, activeCountResult] = await Promise.all([
    supabase
      .from("circle_members")
      .select("id")
      .eq("circle_id", circleId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("circle_has_member_capacity", { check_circle_id: circleId }),
    supabase.rpc("user_active_circle_count", { check_user_id: userId }),
  ]);

  const activeCircleCount = Number(activeCountResult.data ?? 0);
  if (membershipResult.data) {
    return {
      userId,
      canJoin: false,
      requiresCapacityReview: false,
      activeCircleCount,
      maxCirclesWithoutReview: 3,
      message: "You are already a member of this circle.",
    };
  }

  if (capacityResult.error || activeCountResult.error) {
    return {
      userId,
      canJoin: false,
      requiresCapacityReview: false,
      activeCircleCount,
      maxCirclesWithoutReview: 3,
      message: "We could not check your circle capacity. Please try again.",
    };
  }

  if (!capacityResult.data) {
    return {
      userId,
      canJoin: false,
      requiresCapacityReview: false,
      activeCircleCount,
      maxCirclesWithoutReview: 3,
      message: "This circle already has the maximum 15 members.",
    };
  }

  const requiresCapacityReview = activeCircleCount >= 3;
  return {
    userId,
    canJoin: true,
    requiresCapacityReview,
    activeCircleCount,
    maxCirclesWithoutReview: 3,
    message: requiresCapacityReview ? CAPACITY_REVIEW_MESSAGE : "Join request allowed.",
  };
}
