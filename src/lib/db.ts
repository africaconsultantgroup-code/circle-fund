import { supabase } from './supabase';
import type { Database } from './supabase-types';
import type { UserProfile } from './auth';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Circle = Database['public']['Tables']['circles']['Row'];
export type CircleInsert = Database['public']['Tables']['circles']['Insert'];
export type CircleMember = Database['public']['Tables']['circle_members']['Row'];
export type UserVerification = Database['public']['Tables']['user_verifications']['Row'];
export type Contribution = Database['public']['Tables']['contributions']['Row'];
export type Payout = Database['public']['Tables']['payouts']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];

export async function getProfileByUserId(userId: string) {
  return supabase.from('profiles').select('*').eq('user_id', userId).single();
}

export async function upsertProfile(profile: Partial<Profile> & { user_id: string }) {
  return supabase.from('profiles').upsert(profile).select('*').single();
}

export async function getUserVerification(userId: string) {
  return supabase.from('user_verifications').select('*').eq('user_id', userId).maybeSingle();
}

export async function requestPhoneOtp(phoneNumber: string) {
  return supabase.functions.invoke('request-phone-otp', {
    body: { phoneNumber },
  });
}

export async function verifyPhoneOtp(phoneNumber: string, otp: string) {
  return supabase.functions.invoke('verify-phone-otp', {
    body: { phoneNumber, otp },
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

export async function getCircleByInviteToken(inviteToken: string) {
  return supabase.from('circles').select('*').eq('invite_token', normalizeInviteToken(inviteToken)).eq('status', 'active').single();
}

export async function countCircleMembers(circleId: string) {
  return supabase
    .from('circle_members')
    .select('id', { count: 'exact', head: true })
    .eq('circle_id', circleId)
    .in('status', ['active', 'pending']);
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

  let circleResult = await createCircle({
    ...payload,
    owner_id: userId,
    invite_token: payload.invite_token ?? generateInviteToken(),
    max_members: Math.min(Math.max(payload.max_members ?? 15, 2), 15),
  });

  for (let attempt = 0; circleResult.error && /invite_token|duplicate key|unique/i.test(circleResult.error.message) && attempt < 2; attempt += 1) {
    circleResult = await createCircle({
      ...payload,
      owner_id: userId,
      invite_token: generateInviteToken(),
      max_members: Math.min(Math.max(payload.max_members ?? 15, 2), 15),
    });
  }

  if (circleResult.error || !circleResult.data) {
    return { data: null, error: { message: describeCircleCreateError(circleResult.error.message) } };
  }

  const memberResult = await createCircleMember({
    circle_id: circleResult.data.id,
    user_id: userId,
    role: 'admin',
    status: 'active',
    invited_by: userId,
  });

  if (memberResult.error) {
    await supabase.from('circles').delete().eq('id', circleResult.data.id);
    return { data: null, error: { message: describeCircleMemberError(memberResult.error.message) } };
  }

  return { data: circleResult.data, error: null };
}

function describeCircleCreateError(message: string) {
  if (/row-level security|violates row-level security/i.test(message)) {
    return 'Please sign in before creating a circle.';
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

  const capacityResult = await supabase.rpc('circle_has_member_capacity', { check_circle_id: circleId });
  if (capacityResult.error) {
    return { data: null, error: capacityResult.error };
  }

  if (!capacityResult.data) {
    return { data: null, error: { message: 'This circle already has the maximum 15 members.' } };
  }

  const membershipResult = await getCircleMembership(circleId, userId);
  if (membershipResult.error) {
    return { data: null, error: membershipResult.error };
  }

  if (membershipResult.data) {
    return { data: null, error: { message: 'You are already a member of this circle.' } };
  }

  return createCircleMember({
    circle_id: circleId,
    user_id: userId,
    role: 'member',
    status: 'pending',
  });
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
  return supabase.from('circle_members').select('*').eq('circle_id', circleId).order('joined_at', { ascending: true });
}

export async function addContribution(payload: {
  circle_id: string;
  user_id: string;
  amount: number;
  contribution_date?: string | null;
  method?: string | null;
  status?: Database['public']['Enums']['contribution_status'];
  reference?: string | null;
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
  return supabase.from('contributions').select('*').eq('circle_id', circleId).order('contribution_date', { ascending: false });
}

export async function listCirclePayouts(circleId: string) {
  return supabase.from('payouts').select('*').eq('circle_id', circleId).order('payout_date', { ascending: false });
}
