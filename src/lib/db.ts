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
    return { data: null, error: eligibilityResult.error ?? { message: 'Complete onboarding before creating a circle.' } };
  }

  const circleResult = await createCircle(payload);
  if (circleResult.error || !circleResult.data) {
    return { data: null, error: circleResult.error };
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
    return { data: null, error: memberResult.error };
  }

  return { data: circleResult.data, error: null };
}

export async function joinCircle(circleId: string, userId: string) {
  const eligibilityResult = await supabase.rpc('user_passes_circle_onboarding', { check_user_id: userId });
  if (eligibilityResult.error || !eligibilityResult.data) {
    return { data: null, error: eligibilityResult.error ?? { message: 'Complete onboarding before joining a circle.' } };
  }

  const capacityResult = await supabase.rpc('circle_has_member_capacity', { check_circle_id: circleId });
  if (capacityResult.error) {
    return { data: null, error: capacityResult.error };
  }

  if (!capacityResult.data) {
    return { data: null, error: { message: 'This circle already has the maximum 15 members.' } };
  }

  return createCircleMember({
    circle_id: circleId,
    user_id: userId,
    role: 'member',
    status: 'pending',
  });
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
