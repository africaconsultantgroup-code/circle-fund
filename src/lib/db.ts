import { supabase } from "./supabase";
import type { Database, Json, PaymentType } from "./supabase-types";
import { canCreateCircle, canJoinCircle } from "./circle-limits";
import type { UserProfile } from "./auth";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Circle = Database["public"]["Tables"]["circles"]["Row"];
export type CircleInsert = Database["public"]["Tables"]["circles"]["Insert"];
export type CircleMember = Database["public"]["Tables"]["circle_members"]["Row"];
export type UserVerification = Database["public"]["Tables"]["user_verifications"]["Row"];
export type Contribution = Database["public"]["Tables"]["contributions"]["Row"];
export type Payout = Database["public"]["Tables"]["payouts"]["Row"];
export type PaymentTransaction = Database["public"]["Tables"]["payment_transactions"]["Row"];
export type HubtelPaymentTransaction = PaymentTransaction & {
  checkoutUrl?: string | null;
};
export type WalletAccount = Database["public"]["Tables"]["wallet_accounts"]["Row"];
export type WalletTransaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
export type CustomerFinancialSummary =
  Database["public"]["Functions"]["get_customer_financial_summary"]["Returns"][number];
export type CustomerPaymentBreakdownItem =
  Database["public"]["Functions"]["get_customer_payment_breakdown"]["Returns"][number];
export type CustomerReceivedSummary =
  Database["public"]["Functions"]["get_customer_received_summary"]["Returns"][number];
export type CircleMemberFinancialSummary =
  Database["public"]["Functions"]["get_circle_member_financial_summary"]["Returns"][number];
export type CustomerPaymentHistoryItem =
  Database["public"]["Functions"]["get_customer_payment_history"]["Returns"][number];
export type PiggyFinancialSummaryItem =
  Database["public"]["Functions"]["get_piggy_financial_summary"]["Returns"][number];
export type CirclePaymentSummary =
  Database["public"]["Functions"]["get_circle_payment_summary"]["Returns"][number];
export type PayoutRotationItem =
  Database["public"]["Functions"]["get_circle_payout_rotation"]["Returns"][number];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type PersonalSusuPlan = Database["public"]["Tables"]["personal_susu_plans"]["Row"];
export type PersonalSusuPlanInsert = Database["public"]["Tables"]["personal_susu_plans"]["Insert"];
export type PersonalSusuDeposit = Database["public"]["Tables"]["personal_susu_deposits"]["Row"];
export type PersonalSusuDepositInsert =
  Database["public"]["Tables"]["personal_susu_deposits"]["Insert"];
export type CircleMemberDetails =
  Database["public"]["Functions"]["get_circle_members"]["Returns"][number];
export type CircleContributionStatus =
  Database["public"]["Functions"]["get_circle_contribution_status"]["Returns"][number];
export type CircleAccess = Database["public"]["Functions"]["get_circle_access"]["Returns"][number];
export type CapacityReview = Database["public"]["Tables"]["capacity_reviews"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type AdminDuePayout =
  Database["public"]["Functions"]["list_due_payouts_for_admin"]["Returns"][number];

export async function getProfileByUserId(userId: string) {
  return supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
}

export async function upsertProfile(profile: Partial<Profile> & { user_id: string }) {
  const existing = await getProfileByUserId(profile.user_id);

  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if (existing.data) {
    const { id: _id, user_id: _userId, created_at: _createdAt, ...updates } = profile;
    return supabase
      .from("profiles")
      .update({
        ...updates,
        updated_at: profile.updated_at ?? new Date().toISOString(),
      })
      .eq("user_id", profile.user_id)
      .select("*")
      .single();
  }

  const inserted = await supabase.from("profiles").insert(profile).select("*").single();
  if (!inserted.error || !/duplicate key|profiles_user_id_key/i.test(inserted.error.message)) {
    return inserted;
  }

  const { id: _id, user_id: _userId, created_at: _createdAt, ...updates } = profile;
  return supabase
    .from("profiles")
    .update({
      ...updates,
      updated_at: profile.updated_at ?? new Date().toISOString(),
    })
    .eq("user_id", profile.user_id)
    .select("*")
    .single();
}

export async function getUserVerification(userId: string) {
  const result = await supabase
    .from("user_verifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  console.log("verification_fetch_by_user_id", {
    userId,
    verificationRecordFound: Boolean(result.data),
    verification: result.data,
    error: result.error?.message ?? null,
  });

  return result;
}

export async function getCurrentUserVerification() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const sessionUserId = sessionData.session?.user.id ?? null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  console.log("verification_fetch_auth_context", {
    sessionUserId,
    authUserId: userId,
    sessionError: sessionError?.message ?? null,
    authError: authError?.message ?? null,
    hasAccessToken: Boolean(sessionData.session?.access_token),
  });

  if (sessionError || authError || !userId) {
    console.warn("verification_fetch_auth_user_missing", {
      sessionUserId,
      userId,
      sessionError: sessionError?.message ?? null,
      error: authError?.message ?? null,
    });
    return {
      userId,
      data: null as UserVerification | null,
      error:
        sessionError || authError
          ? { message: sessionError?.message ?? authError?.message ?? "Authentication failed." }
          : { message: "No authenticated user." },
    };
  }

  const { data, error } = await supabase
    .from("user_verifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  console.log("verification_fetch_current_user_result", {
    sessionUserId,
    currentUserId: userId,
    verificationRecordFound: Boolean(data),
    returnedData: data,
    queryError: error?.message ?? null,
  });

  return { userId, data: data ?? null, error: error ? { message: error.message } : null };
}

export async function requestPhoneOtp(phoneNumber: string, countryCode?: string) {
  return invokeAuthedFunction("request-phone-otp", {
    body: { phoneNumber, countryCode },
  });
}

export async function verifyPhoneOtp(
  phoneNumber: string,
  otp: string,
  otpReference?: string | null,
  countryCode?: string,
) {
  return invokeAuthedFunction("verify-phone-otp", {
    body: { phoneNumber, otp, otpReference, countryCode },
  });
}

async function invokeAuthedFunction<T = unknown>(
  functionName: string,
  options: { body: Record<string, unknown> },
) {
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionResult.session?.access_token;

  if (sessionError || !accessToken) {
    return {
      data: null as T | null,
      error: {
        message:
          sessionError?.message ??
          "Your sign-in session is still loading or has expired. Please sign in again.",
      },
    };
  }

  return supabase.functions.invoke<T>(functionName, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function submitGhanaCardVerification(ghanaCardNumber: string) {
  return supabase.functions.invoke("verify-ghana-card", {
    body: { ghanaCardNumber },
  });
}

export async function submitFaceVerification(selfieCaptureReference: string) {
  return supabase.functions.invoke("verify-face", {
    body: { selfieCaptureReference },
  });
}

export async function createCircle(payload: CircleInsert) {
  return supabase.from("circles").insert(payload).select("*").single();
}

export async function getCircleById(circleId: string) {
  return supabase.from("circles").select("*").eq("id", circleId).single();
}

export async function getCircleAccessById(circleId: string) {
  const result = await supabase.rpc("get_circle_access", { check_circle_id: circleId });
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function getCircleByInviteToken(inviteToken: string) {
  const code = normalizeInviteToken(inviteToken);
  return supabase
    .from("circles")
    .select("*")
    .or(`invite_token.eq.${code},invite_code.eq.${code}`)
    .eq("status", "active")
    .single();
}

export async function countCircleMembers(circleId: string) {
  const result = await supabase.rpc("circle_member_count", { check_circle_id: circleId });
  return {
    count: typeof result.data === "number" ? result.data : null,
    error: result.error,
  };
}

export async function countPendingCircleMembers(circleId: string) {
  const result = await supabase.rpc("circle_pending_member_count", { check_circle_id: circleId });
  return {
    count: typeof result.data === "number" ? result.data : null,
    error: result.error,
  };
}

export async function getCircleMembership(circleId: string, userId: string) {
  return supabase
    .from("circle_members")
    .select("*")
    .eq("circle_id", circleId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function listCirclesForUser(userId: string) {
  return supabase
    .from("circle_members")
    .select("circle_id, role, status, joined_at, circles!inner(*)")
    .eq("user_id", userId)
    .neq("circles.status", "archived")
    .order("joined_at", { ascending: false });
}

export async function listArchivedCirclesForUser(userId: string) {
  return supabase
    .from("circle_members")
    .select("circle_id, role, status, joined_at, circles!inner(*)")
    .eq("user_id", userId)
    .eq("circles.status", "archived")
    .order("joined_at", { ascending: false });
}

export async function getCircleLifecycleEligibility(circleId: string) {
  const result = await supabase.rpc("get_circle_lifecycle_eligibility", {
    check_circle_id: circleId,
  });
  return { data: result.data?.[0] ?? null, error: result.error };
}

export async function deleteCircle(circleId: string) {
  return supabase.rpc("delete_circle", { check_circle_id: circleId });
}

export async function archiveCircle(circleId: string) {
  return supabase.rpc("archive_circle", { check_circle_id: circleId });
}

export async function createCircleMember(
  payload: Partial<CircleMember> & { circle_id: string; user_id: string },
) {
  return supabase.from("circle_members").insert(payload).select("*").single();
}

export async function createCircleWithCreator(payload: CircleInsert, userId: string) {
  const eligibilityResult = await supabase.rpc("user_passes_circle_onboarding", {
    check_user_id: userId,
  });
  if (eligibilityResult.error || !eligibilityResult.data) {
    return {
      data: null,
      error: eligibilityResult.error ?? { message: "Please sign in before creating a circle." },
    };
  }

  const createLimit = await canCreateCircle(userId, true);
  if (!createLimit.canCreate) {
    return { data: null, error: { message: createLimit.message } };
  }

  const initialInviteToken = payload.invite_code ?? payload.invite_token ?? generateInviteToken();
  let circleResult = await createCircle({
    ...payload,
    owner_id: userId,
    invite_token: initialInviteToken,
    invite_code: initialInviteToken,
    max_members: Math.min(Math.max(payload.max_members ?? 15, 2), 15),
  });

  for (
    let attempt = 0;
    circleResult.error &&
    /invite_token|invite_code|duplicate key|unique/i.test(circleResult.error.message) &&
    attempt < 2;
    attempt += 1
  ) {
    const nextInviteToken = generateInviteToken();
    circleResult = await createCircle({
      ...payload,
      owner_id: userId,
      invite_token: nextInviteToken,
      invite_code: nextInviteToken,
      max_members: Math.min(Math.max(payload.max_members ?? 15, 2), 15),
    });
  }

  if (circleResult.error || !circleResult.data) {
    return {
      data: null,
      error: { message: describeCircleCreateError(circleResult.error.message) },
    };
  }

  const memberResult = await createCircleMember({
    circle_id: circleResult.data.id,
    user_id: userId,
    role: "creator",
    status: "approved",
    invited_by: userId,
    approved_by: userId,
    approved_at: new Date().toISOString(),
  });

  if (memberResult.error) {
    await supabase.from("circles").delete().eq("id", circleResult.data.id);
    return {
      data: null,
      error: { message: describeCircleMemberError(memberResult.error.message) },
    };
  }

  return { data: circleResult.data, error: null };
}

export type GoalSusuCreateInput = {
  goalName: string;
  description: string;
  targetAmount: number;
  contributionAmount: number;
  frequency: "weekly" | "biweekly" | "monthly";
  payoutFrequency: "one_time" | "weekly" | "every_14_days" | "twice_monthly" | "monthly";
  startDate: string;
  endDate: string;
  twiceMonthlyDayOne: number | null;
  twiceMonthlyDayTwo: number | null;
  maximumMembers: number;
  currency: string;
  inviteValue: string;
  beneficiaryType: "sikacircle_user" | "external";
  beneficiaryUserId: string | null;
  beneficiaryName: string;
  destinationReference: string;
  mobileMoneyNetwork: string;
  relationshipOrPurpose: string;
};

export async function createGoalSusu(input: GoalSusuCreateInput) {
  return supabase.rpc("create_goal_susu_with_cycles", {
    goal_name: input.goalName,
    goal_description: input.description,
    target_amount: input.targetAmount,
    contribution_amount: input.contributionAmount,
    contribution_frequency: input.frequency,
    payout_frequency: input.payoutFrequency,
    overall_start_date: input.startDate,
    overall_end_date: input.endDate,
    maximum_members: input.maximumMembers,
    currency: input.currency,
    invite_value: input.inviteValue,
    beneficiary_type: input.beneficiaryType,
    beneficiary_user_id: input.beneficiaryUserId,
    beneficiary_name: input.beneficiaryName,
    destination_reference: input.destinationReference,
    mobile_money_network: input.mobileMoneyNetwork,
    relationship_or_purpose: input.relationshipOrPurpose,
    twice_monthly_day_one: input.twiceMonthlyDayOne,
    twice_monthly_day_two: input.twiceMonthlyDayTwo,
  });
}

export async function getGoalSusuJoinPreview(inviteValue: string) {
  return supabase.rpc("get_goal_susu_join_preview", { invite_value: inviteValue });
}

export async function acceptGoalSusuTerms(circleId: string) {
  return supabase.rpc("accept_goal_susu_terms", { check_circle_id: circleId });
}

export async function getGoalSusuProgress(circleId: string) {
  return supabase.rpc("goal_susu_progress", { check_circle_id: circleId });
}

export async function getGoalSusuCycles(circleId: string) {
  return supabase.rpc("get_goal_susu_cycles", { check_circle_id: circleId });
}

function describeCircleCreateError(message: string) {
  if (/row-level security|violates row-level security/i.test(message)) {
    return "You can only administer 2 active susu groups at a time.";
  }

  return message || "We could not save this circle. Please try again.";
}

function describeCircleMemberError(message: string) {
  if (/row-level security|violates row-level security/i.test(message)) {
    return "The circle was created, but we could not add you as creator. Please sign in and try again.";
  }

  if (/duplicate key|unique/i.test(message)) {
    return "You are already a member of this circle.";
  }

  return message || "We could not add you as the circle creator. Please try again.";
}

export async function joinCircle(circleId: string, userId: string) {
  const eligibilityResult = await supabase.rpc("user_passes_circle_onboarding", {
    check_user_id: userId,
  });
  if (eligibilityResult.error || !eligibilityResult.data) {
    return {
      data: null,
      error: eligibilityResult.error ?? { message: "Please sign in before joining a circle." },
    };
  }

  const joinLimit = await canJoinCircle(circleId, userId, true);
  if (!joinLimit.canJoin) {
    return { data: null, error: { message: joinLimit.message } };
  }

  const memberResult = await createCircleMember({
    circle_id: circleId,
    user_id: userId,
    role: "member",
    status: "pending",
  });

  if (memberResult.error || !memberResult.data) {
    return memberResult;
  }

  if (joinLimit.requiresCapacityReview || memberResult.data.requires_capacity_review) {
    return {
      data: memberResult.data,
      error: null,
      message: joinLimit.message,
    };
  }

  return { ...memberResult, message: "Join request sent. Opening circle details." };
}

export function generateInviteToken() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "SC-";
  for (let index = 0; index < 8; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

export function normalizeInviteToken(inviteToken: string) {
  return inviteToken.trim().toUpperCase();
}

export async function listCircleMembers(circleId: string) {
  return supabase.rpc("get_circle_members", { check_circle_id: circleId });
}

export async function manageCircleMember(
  membershipId: string,
  action: "approve" | "reject" | "remove",
) {
  return supabase.rpc("manage_circle_member", { check_membership_id: membershipId, action });
}

export async function listNotifications() {
  return supabase.from("notifications").select("*").order("created_at", { ascending: false });
}

export async function addContribution(payload: {
  circle_id: string;
  member_id?: string | null;
  user_id: string;
  amount: number;
  amount_due?: number | null;
  contribution_date?: string | null;
  due_date?: string | null;
  method?: string | null;
  status?: Database["public"]["Enums"]["contribution_status"];
  reference?: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
}) {
  return supabase.from("contributions").insert(payload).select("*").single();
}

export async function recordPayout(payload: {
  circle_id: string;
  user_id: string;
  amount: number;
  payout_date?: string | null;
  status?: Database["public"]["Enums"]["payout_status"];
  method?: string | null;
  reference?: string | null;
}) {
  return supabase.from("payouts").insert(payload).select("*").single();
}

export async function createTransaction(payload: {
  user_id: string;
  circle_id?: string | null;
  type: Database["public"]["Enums"]["transaction_type"];
  amount: number;
  currency: string;
  status?: Database["public"]["Enums"]["transaction_status"];
  description?: string | null;
  reference?: string | null;
}) {
  return supabase.from("transactions").insert(payload).select("*").single();
}

export async function listTransactionsForUser(userId: string) {
  return supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export async function listCircleContributions(circleId: string) {
  return supabase.rpc("get_circle_contribution_status", { check_circle_id: circleId });
}

export async function getCustomerFinancialSummary() {
  const result = await supabase.rpc("get_customer_financial_summary");
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function getCustomerPaymentHistory() {
  return supabase.rpc("get_customer_payment_history");
}

export async function getCustomerPaymentBreakdown() {
  return supabase.rpc("get_customer_payment_breakdown");
}

export async function getCustomerReceivedSummary() {
  const result = await supabase.rpc("get_customer_received_summary");
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function getCircleMemberFinancialSummary(circleId: string) {
  const result = await supabase.rpc("get_circle_member_financial_summary", {
    check_circle_id: circleId,
  });
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function getPiggyFinancialSummary() {
  return supabase.rpc("get_piggy_financial_summary");
}

export async function getCirclePaymentSummary(circleId: string) {
  const result = await supabase.rpc("get_circle_payment_summary", { check_circle_id: circleId });
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function generateCircleContributionSchedule(circleId: string, periods = 1) {
  return supabase.rpc("generate_circle_contribution_schedule", {
    check_circle_id: circleId,
    periods,
  });
}

export async function initiateHubtelContributionPayment(contributionId: string) {
  const result = await invokeAuthedFunction<{
    ok: boolean;
    transaction: HubtelPaymentTransaction;
    checkoutUrl?: string | null;
    providerReference?: string | null;
    message?: string;
  }>("initiate-hubtel-payment", {
    body: { paymentType: "contribution", contributionId },
  });

  return normalizeHubtelPaymentResult(result);
}

export async function initiateHubtelPayment(payload: {
  paymentType: PaymentType;
  amount: number;
  currency?: string;
  circleId?: string | null;
  contributionId?: string | null;
  metadata?: Json;
}) {
  const result = await invokeAuthedFunction<{
    ok: boolean;
    transaction: HubtelPaymentTransaction;
    checkoutUrl?: string | null;
    providerReference?: string | null;
    message?: string;
  }>("initiate-hubtel-payment", {
    body: {
      paymentType: payload.paymentType,
      amount: payload.amount,
      currency: payload.currency ?? "GHS",
      circleId: payload.circleId ?? null,
      contributionId: payload.contributionId ?? null,
      metadata: payload.metadata ?? {},
    },
  });

  return normalizeHubtelPaymentResult(result);
}

export async function payFromWallet(payload: {
  paymentType: "contribution" | "piggy_bag" | "savings";
  amount?: number | null;
  currency?: string | null;
  circleId?: string | null;
  contributionId?: string | null;
  planId?: string | null;
  metadata?: Json;
}) {
  return supabase.rpc("pay_from_wallet", {
    payment_type: payload.paymentType,
    amount: payload.amount ?? null,
    currency: payload.currency ?? "GHS",
    circle_id: payload.circleId ?? null,
    contribution_id: payload.contributionId ?? null,
    plan_id: payload.planId ?? null,
    metadata: payload.metadata ?? {},
  });
}

function normalizeHubtelPaymentResult(result: {
  data: {
    ok: boolean;
    transaction: HubtelPaymentTransaction;
    checkoutUrl?: string | null;
    providerReference?: string | null;
    message?: string;
  } | null;
  error: { message: string } | null;
}) {
  if (result.error || !result.data?.transaction) {
    return {
      data: null as HubtelPaymentTransaction | null,
      error: result.error ?? { message: "Unable to initiate Hubtel payment." },
    };
  }

  return {
    data: {
      ...result.data.transaction,
      checkoutUrl: result.data.checkoutUrl ?? null,
    },
    error: null,
  };
}

export async function listCirclePayouts(circleId: string) {
  return supabase
    .from("payouts")
    .select("*")
    .eq("circle_id", circleId)
    .order("payout_date", { ascending: false });
}

export async function listCirclePayoutRotation(circleId: string) {
  return supabase.rpc("get_circle_payout_rotation", { check_circle_id: circleId });
}

export async function generateCirclePayoutRotation(circleId: string, regenerate = false) {
  return supabase.rpc("generate_circle_payout_rotation", {
    check_circle_id: circleId,
    regenerate,
  });
}

export async function lockCirclePayoutRotation(circleId: string) {
  return supabase.rpc("lock_circle_payout_rotation", { check_circle_id: circleId });
}

export async function listDuePayoutsForAdmin() {
  return supabase.rpc("list_due_payouts_for_admin");
}

export async function manualTriggerPayout(scheduleId: string, reason: string) {
  return supabase.rpc("manual_trigger_payout", {
    check_schedule_id: scheduleId,
    reason,
  });
}

export async function placePayoutHold(scheduleId: string, reason: string) {
  return supabase.rpc("place_payout_hold", {
    check_schedule_id: scheduleId,
    reason,
  });
}

export async function releasePayoutHold(scheduleId: string, reason?: string | null) {
  return supabase.rpc("release_payout_hold", {
    check_schedule_id: scheduleId,
    reason: reason ?? null,
  });
}

export async function listCapacityReviews() {
  return supabase.from("capacity_reviews").select("*").order("created_at", { ascending: false });
}

export async function manageCapacityReview(
  reviewId: string,
  action: "approve" | "reject",
  notes?: string | null,
) {
  return supabase.rpc("admin_manage_capacity_review", {
    check_review_id: reviewId,
    action,
    notes: notes ?? null,
  });
}

export async function listPersonalSusuPlans(userId: string) {
  return supabase
    .from("personal_susu_plans")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

export async function getPersonalSusuPlan(planId: string, userId: string) {
  return supabase
    .from("personal_susu_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();
}

export async function createPersonalSusuPlan(payload: PersonalSusuPlanInsert) {
  return supabase.from("personal_susu_plans").insert(payload).select("*").single();
}

export async function listPersonalSusuDeposits(planId: string, userId: string) {
  return supabase
    .from("personal_susu_deposits")
    .select("*")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .order("deposited_at", { ascending: false });
}

export async function createPersonalSusuDeposit(payload: PersonalSusuDepositInsert) {
  return supabase.from("personal_susu_deposits").insert(payload).select("*").single();
}
