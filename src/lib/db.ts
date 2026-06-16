import { supabase } from './supabase';
import type { Database, Json, PaymentType } from './supabase-types';
import { canCreateCircle, canJoinCircle } from './circle-limits';
import type { UserProfile } from './auth';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Circle = Database['public']['Tables']['circles']['Row'];
export type CircleInsert = Database['public']['Tables']['circles']['Insert'];
export type CircleMember = Database['public']['Tables']['circle_members']['Row'];
export type UserVerification = Database['public']['Tables']['user_verifications']['Row'];
export type Contribution = Database['public']['Tables']['contributions']['Row'];
export type Payout = Database['public']['Tables']['payouts']['Row'];
export type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row'];
export type HubtelPaymentTransaction = PaymentTransaction & {
  checkoutUrl?: string | null;
};
export type WalletAccount = Database['public']['Tables']['wallet_accounts']['Row'];
export type WalletTransaction = Database['public']['Tables']['wallet_transactions']['Row'];
export type PayoutRotationItem = Database['public']['Functions']['get_circle_payout_rotation']['Returns'][number];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type PersonalSusuPlan = Database['public']['Tables']['personal_susu_plans']['Row'];
export type PersonalSusuPlanInsert = Database['public']['Tables']['personal_susu_plans']['Insert'];
export type PersonalSusuDeposit = Database['public']['Tables']['personal_susu_deposits']['Row'];
export type PersonalSusuDepositInsert = Database['public']['Tables']['personal_susu_deposits']['Insert'];
export type CircleMemberDetails = Database['public']['Functions']['get_circle_members']['Returns'][number];
export type CircleContributionStatus = Database['public']['Functions']['get_circle_contribution_status']['Returns'][number];
export type CircleAccess = Database['public']['Functions']['get_circle_access']['Returns'][number];
export type CapacityReview = Database['public']['Tables']['capacity_reviews']['Row'];
export type AdminDuePayout = Database['public']['Functions']['list_due_payouts_for_admin']['Returns'][number];

export async function getProfileByUserId(userId: string) {
  return supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
}

export async function upsertProfile(profile: Partial<Profile> & { user_id: string }) {
  const existing = await getProfileByUserId(profile.user_id);

  if (existing.error) {
    return { data: null, error: existing.error };
  }

  if (existing.data) {
    return supabase
      .from('profiles')
      .update({
        ...profile,
        updated_at: profile.updated_at ?? new Date().toISOString(),
      })
      .eq('user_id', profile.user_id)
      .select('*')
      .single();
  }

  const inserted = await supabase.from('profiles').insert(profile).select('*').single();
  if (!inserted.error || !/duplicate key|profiles_user_id_key/i.test(inserted.error.message)) {
    return inserted;
  }

  return supabase
    .from('profiles')
    .update({
      ...profile,
      updated_at: profile.updated_at ?? new Date().toISOString(),
    })
    .eq('user_id', profile.user_id)
    .select('*')
    .single();
}

export async function getUserVerification(userId: string) {
  const result = await supabase
    .from('user_verifications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  console.log('verification_fetch_by_user_id', {
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

  console.log('verification_fetch_auth_context', {
    sessionUserId,
    authUserId: userId,
    sessionError: sessionError?.message ?? null,
    authError: authError?.message ?? null,
    hasAccessToken: Boolean(sessionData.session?.access_token),
  });

  if (sessionError || authError || !userId) {
    console.warn('verification_fetch_auth_user_missing', {
      sessionUserId,
      userId,
      sessionError: sessionError?.message ?? null,
      error: authError?.message ?? null,
    });
    return {
      userId,
      data: null as UserVerification | null,
      error: sessionError || authError ? { message: sessionError?.message ?? authError?.message ?? 'Authentication failed.' } : { message: 'No authenticated user.' },
    };
  }

  const { data, error } = await supabase
    .from('user_verifications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  console.log('verification_fetch_current_user_result', {
    sessionUserId,
    currentUserId: userId,
    verificationRecordFound: Boolean(data),
    returnedData: data,
    queryError: error?.message ?? null,
  });

  return { userId, data: data ?? null, error: error ? { message: error.message } : null };
}

export async function requestPhoneOtp(phoneNumber: string, countryCode?: string) {
  return invokeAuthedFunction('request-phone-otp', {
    body: { phoneNumber, countryCode },
  });
}

export async function verifyPhoneOtp(phoneNumber: string, otp: string, otpReference?: string | null, countryCode?: string) {
  return invokeAuthedFunction('verify-phone-otp', {
    body: { phoneNumber, otp, otpReference, countryCode },
  });
}

async function invokeAuthedFunction<T = unknown>(functionName: string, options: { body: Record<string, unknown> }) {
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionResult.session?.access_token;

  if (sessionError || !accessToken) {
    return {
      data: null as T | null,
      error: {
        message: sessionError?.message ?? 'Your sign-in session is still loading or has expired. Please sign in again.',
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
  return supabase.functions.invoke('verify-ghana-card', {
    body: { ghanaCardNumber },
  });
}

export async function submitFaceVerification(selfieCaptureReference: string) {
  return supabase.functions.invoke('verify-face', {
    body: { selfieCaptureReference },
  });
}

export async function createCircle(payload: CircleInsert) {
  return supabase.from('circles').insert(payload).select('*').single();
}

export async function getCircleById(circleId: string) {
  return supabase.from('circles').select('*').eq('id', circleId).single();
}

export async function getCircleAccessById(circleId: string) {
  const result = await supabase.rpc('get_circle_access', { check_circle_id: circleId });
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function getCircleByInviteToken(inviteToken: string) {
  const code = normalizeInviteToken(inviteToken);
  return supabase
    .from('circles')
    .select('*')
    .or(`invite_token.eq.${code},invite_code.eq.${code}`)
    .eq('status', 'active')
    .single();
}

export async function countCircleMembers(circleId: string) {
  const result = await supabase.rpc('circle_member_count', { check_circle_id: circleId });
  return {
    count: typeof result.data === 'number' ? result.data : null,
    error: result.error,
  };
}

export async function countPendingCircleMembers(circleId: string) {
  const result = await supabase.rpc('circle_pending_member_count', { check_circle_id: circleId });
  return {
    count: typeof result.data === 'number' ? result.data : null,
    error: result.error,
  };
}

export async function getCircleMembership(circleId: string, userId: string) {
  return supabase
    .from('circle_members')
    .select('*')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function listCirclesForUser(userId: string) {
  return supabase
    .from('circle_members')
    .select('circle_id, role, status, joined_at, circles(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });
}

export async function createCircleMember(payload: Partial<CircleMember> & { circle_id: string; user_id: string }) {
  return supabase.from('circle_members').insert(payload).select('*').single();
}

export async function createCircleWithCreator(payload: CircleInsert, userId: string) {
  const eligibilityResult = await supabase.rpc('user_passes_circle_onboarding', { check_user_id: userId });
  if (eligibilityResult.error || !eligibilityResult.data) {
    return { data: null, error: eligibilityResult.error ?? { message: 'Please sign in before creating a circle.' } };
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

  for (let attempt = 0; circleResult.error && /invite_token|invite_code|duplicate key|unique/i.test(circleResult.error.message) && attempt < 2; attempt += 1) {
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
    return { data: null, error: { message: describeCircleCreateError(circleResult.error.message) } };
  }

  const memberResult = await createCircleMember({
    circle_id: circleResult.data.id,
    user_id: userId,
    role: 'creator',
    status: 'approved',
    invited_by: userId,
    approved_by: userId,
    approved_at: new Date().toISOString(),
  });

  if (memberResult.error) {
    await supabase.from('circles').delete().eq('id', circleResult.data.id);
    return { data: null, error: { message: describeCircleMemberError(memberResult.error.message) } };
  }

  return { data: circleResult.data, error: null };
}

function describeCircleCreateError(message: string) {
  if (/row-level security|violates row-level security/i.test(message)) {
    return 'You can only administer 2 active susu groups at a time.';
  }

  return message || 'We could not save this circle. Please try again.';
}

function describeCircleMemberError(message: string) {
  if (/row-level security|violates row-level security/i.test(message)) {
    return 'The circle was created, but we could not add you as creator. Please sign in and try again.';
  }

  if (/duplicate key|unique/i.test(message)) {
    return 'You are already a member of this circle.';
  }

  return message || 'We could not add you as the circle creator. Please try again.';
}

export async function joinCircle(circleId: string, userId: string) {
  const eligibilityResult = await supabase.rpc('user_passes_circle_onboarding', { check_user_id: userId });
  if (eligibilityResult.error || !eligibilityResult.data) {
    return { data: null, error: eligibilityResult.error ?? { message: 'Please sign in before joining a circle.' } };
  }

  const joinLimit = await canJoinCircle(circleId, userId, true);
  if (!joinLimit.canJoin) {
    return { data: null, error: { message: joinLimit.message } };
  }

  const memberResult = await createCircleMember({
    circle_id: circleId,
    user_id: userId,
    role: 'member',
    status: 'pending',
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

  return { ...memberResult, message: 'Join request sent. Opening circle details.' };
}

export function generateInviteToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = 'SC-';
  for (let index = 0; index < 8; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

export function normalizeInviteToken(inviteToken: string) {
  return inviteToken.trim().toUpperCase();
}

export async function listCircleMembers(circleId: string) {
  return supabase.rpc('get_circle_members', { check_circle_id: circleId });
}

export async function manageCircleMember(membershipId: string, action: 'approve' | 'reject' | 'remove') {
  return supabase.rpc('manage_circle_member', { check_membership_id: membershipId, action });
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
  status?: Database['public']['Enums']['contribution_status'];
  reference?: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
}) {
  return supabase.from('contributions').insert(payload).select('*').single();
}

export async function recordPayout(payload: {
  circle_id: string;
  user_id: string;
  amount: number;
  payout_date?: string | null;
  status?: Database['public']['Enums']['payout_status'];
  method?: string | null;
  reference?: string | null;
}) {
  return supabase.from('payouts').insert(payload).select('*').single();
}

export async function createTransaction(payload: {
  user_id: string;
  circle_id?: string | null;
  type: Database['public']['Enums']['transaction_type'];
  amount: number;
  currency: string;
  status?: Database['public']['Enums']['transaction_status'];
  description?: string | null;
  reference?: string | null;
}) {
  return supabase.from('transactions').insert(payload).select('*').single();
}

export async function listTransactionsForUser(userId: string) {
  return supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function listCircleContributions(circleId: string) {
  return supabase.rpc('get_circle_contribution_status', { check_circle_id: circleId });
}

export async function generateCircleContributionSchedule(circleId: string, periods = 1) {
  return supabase.rpc('generate_circle_contribution_schedule', {
    check_circle_id: circleId,
    periods,
  });
}

export async function markContributionPaidForTesting(contributionId: string, paymentReference?: string | null) {
  return supabase.rpc('mark_contribution_paid_for_testing', {
    check_contribution_id: contributionId,
    payment_reference: paymentReference ?? null,
  });
}

export async function initiateHubtelContributionPayment(contributionId: string) {
  const result = await invokeAuthedFunction<{
    ok: boolean;
    transaction: HubtelPaymentTransaction;
    checkoutUrl?: string | null;
    providerReference?: string | null;
    message?: string;
  }>('initiate-hubtel-payment', {
    body: { paymentType: 'contribution', contributionId },
  });

  return normalizeHubtelPaymentResult(result);
}

export async function initiatePlaceholderPayment(payload: {
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
  }>('initiate-hubtel-payment', {
    body: {
      paymentType: payload.paymentType,
      amount: payload.amount,
      currency: payload.currency ?? 'GHS',
      circleId: payload.circleId ?? null,
      contributionId: payload.contributionId ?? null,
      metadata: payload.metadata ?? {},
    },
  });

  return normalizeHubtelPaymentResult(result);
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
      error: result.error ?? { message: 'Unable to initiate Hubtel payment.' },
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
  return supabase.from('payouts').select('*').eq('circle_id', circleId).order('payout_date', { ascending: false });
}

export async function listCirclePayoutRotation(circleId: string) {
  return supabase.rpc('get_circle_payout_rotation', { check_circle_id: circleId });
}

export async function generateCirclePayoutRotation(circleId: string, regenerate = false) {
  return supabase.rpc('generate_circle_payout_rotation', {
    check_circle_id: circleId,
    regenerate,
  });
}

export async function lockCirclePayoutRotation(circleId: string) {
  return supabase.rpc('lock_circle_payout_rotation', { check_circle_id: circleId });
}

export async function listDuePayoutsForAdmin() {
  return supabase.rpc('list_due_payouts_for_admin');
}

export async function manualTriggerPayout(scheduleId: string, reason: string) {
  return supabase.rpc('manual_trigger_payout', {
    check_schedule_id: scheduleId,
    reason,
  });
}

export async function placePayoutHold(scheduleId: string, reason: string) {
  return supabase.rpc('place_payout_hold', {
    check_schedule_id: scheduleId,
    reason,
  });
}

export async function releasePayoutHold(scheduleId: string, reason?: string | null) {
  return supabase.rpc('release_payout_hold', {
    check_schedule_id: scheduleId,
    reason: reason ?? null,
  });
}

export async function listCapacityReviews() {
  return supabase.from('capacity_reviews').select('*').order('created_at', { ascending: false });
}

export async function manageCapacityReview(reviewId: string, action: 'approve' | 'reject', notes?: string | null) {
  return supabase.rpc('admin_manage_capacity_review', {
    check_review_id: reviewId,
    action,
    notes: notes ?? null,
  });
}

export async function listPersonalSusuPlans(userId: string) {
  return supabase
    .from('personal_susu_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

export async function getPersonalSusuPlan(planId: string, userId: string) {
  return supabase
    .from('personal_susu_plans')
    .select('*')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();
}

export async function createPersonalSusuPlan(payload: PersonalSusuPlanInsert) {
  return supabase.from('personal_susu_plans').insert(payload).select('*').single();
}

export async function listPersonalSusuDeposits(planId: string, userId: string) {
  return supabase
    .from('personal_susu_deposits')
    .select('*')
    .eq('plan_id', planId)
    .eq('user_id', userId)
    .order('deposited_at', { ascending: false });
}

export async function createPersonalSusuDeposit(payload: PersonalSusuDepositInsert) {
  return supabase.from('personal_susu_deposits').insert(payload).select('*').single();
}
