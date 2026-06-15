import { supabase, isSupabaseConfigured } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  phone?: string | null;
}

export interface UserProfile extends AuthUser {
  full_name: string | null;
  avatar_url: string | null;
  ghana_card_verification_status?: string;
  selfie_image_url?: string | null;
  profile_completed?: boolean;
  account_status?: string;
  role?: string;
  created_at: string | null;
  updated_at: string | null;
}

export type AuthResponse = {
  data: { user: AuthUser | null; hasSession?: boolean };
  error: AuthErrorMessage | null;
};

export type AuthErrorMessage = {
  message: string;
  code?: string;
  originalMessage?: string;
};

async function fallbackSuccess(email: string): Promise<AuthResponse> {
  return {
    data: { user: { id: 'local-user', email, phone: null }, hasSession: true },
    error: null,
  };
}

async function fallbackError(message: string): Promise<AuthResponse> {
  return { data: { user: null }, error: { message } };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResponse> {
  if (!isSupabaseConfigured) {
    return fallbackSuccess(email);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn("supabase_auth_signin_failed", {
      message: error.message,
      code: error.code,
      status: error.status,
    });
    return { data: { user: null }, error: mapAuthError(error) };
  }

  return {
    data: { user: data.user ? { id: data.user.id, email: data.user.email, phone: data.user.phone } : null },
    error: null,
  };
}

export type SignUpProfileMetadata = {
  full_name?: string | null;
  phone?: string | null;
  country?: string | null;
  preferred_currency?: string | null;
  expected_monthly_contribution?: number | null;
};

export async function signUpWithEmail(email: string, password: string, metadata?: SignUpProfileMetadata): Promise<AuthResponse> {
  if (!isSupabaseConfigured) {
    return fallbackSuccess(email);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  });
  if (error) {
    console.warn("supabase_auth_signup_failed", {
      email,
      message: error.message,
      code: error.code,
      status: error.status,
    });
    return { data: { user: null }, error: mapAuthError(error) };
  }

  return {
    data: {
      user: data.user ? { id: data.user.id, email: data.user.email, phone: data.user.phone } : null,
      hasSession: Boolean(data.session),
    },
    error: null,
  };
}

export function mapAuthError(error: { message?: string; code?: string; status?: number }): AuthErrorMessage {
  const message = error.message ?? "";
  const normalized = message.toLowerCase();
  const code = error.code?.toLowerCase();

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    normalized.includes("user already registered") ||
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return {
      message: "An account with this email already exists. Please sign in.",
      code: error.code,
      originalMessage: message,
    };
  }

  if (
    error.status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "email_rate_limit_exceeded" ||
    normalized.includes("email rate limit") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many")
  ) {
    return {
      message: "Too many account verification requests have been made. Please wait and try again later.",
      code: error.code,
      originalMessage: message,
    };
  }

  return {
    message: message || "Unable to complete authentication. Please try again.",
    code: error.code,
    originalMessage: message,
  };
}

export async function signOut(): Promise<{ error: { message: string } | null }> {
  if (!isSupabaseConfigured) {
    return { error: null };
  }

  const { error } = await supabase.auth.signOut();
  return { error: error ? { message: error.message } : null };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) {
    return { id: 'local-user', email: null, phone: null };
  }

  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email, phone: data.user.phone } : null;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    email: user.email,
    phone: data.phone,
    full_name: data.full_name,
    avatar_url: data.avatar_url,
    ghana_card_verification_status: data.ghana_card_verification_status,
    selfie_image_url: data.selfie_image_url,
    profile_completed: data.profile_completed,
    account_status: data.account_status,
    role: data.role,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function upsertUserProfile(profile: {
  user_id: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  preferred_currency?: string | null;
  expected_monthly_contribution?: number | null;
  avatar_url?: string | null;
  ghana_card_verification_status?: string;
  selfie_image_url?: string | null;
  profile_completed?: boolean;
  account_status?: string;
  role?: string;
}) {
  if (!isSupabaseConfigured) {
    return { data: null, error: { message: 'Supabase is not configured.' } };
  }

  const existing = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', profile.user_id)
    .maybeSingle();

  if (existing.error) {
    return { data: null, error: { message: existing.error.message } };
  }

  if (existing.data) {
    return supabase
      .from('profiles')
      .update({
        ...profile,
        updated_at: new Date().toISOString(),
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
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', profile.user_id)
    .select('*')
    .single();
}
