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
  phone_otp_verification_status?: string;
  selfie_image_url?: string | null;
  profile_completed?: boolean;
  account_status?: string;
  role?: string;
  created_at: string | null;
  updated_at: string | null;
}

export type AuthResponse = {
  data: { user: AuthUser | null };
  error: { message: string } | null;
};

async function fallbackSuccess(email: string): Promise<AuthResponse> {
  return {
    data: { user: { id: 'local-user', email, phone: null } },
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
    return fallbackError(error.message);
  }

  return {
    data: { user: data.user ? { id: data.user.id, email: data.user.email, phone: data.user.phone } : null },
    error: null,
  };
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResponse> {
  if (!isSupabaseConfigured) {
    return fallbackSuccess(email);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildAuthRedirectUrl("/verify/phone"),
    },
  });
  if (error) {
    return fallbackError(error.message);
  }

  return {
    data: { user: data.user ? { id: data.user.id, email: data.user.email, phone: data.user.phone } : null },
    error: null,
  };
}

export function buildAuthRedirectUrl(next = "/verify/phone") {
  const origin = getAppOrigin();
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}

function getAppOrigin() {
  const configuredUrl = import.meta.env.VITE_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (isLocalhost || import.meta.env.DEV) return window.location.origin;
  }

  return "https://app.sikacircle.com";
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
    phone_otp_verification_status: data.phone_otp_verification_status,
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
  phone?: string | null;
  avatar_url?: string | null;
  ghana_card_verification_status?: string;
  phone_otp_verification_status?: string;
  selfie_image_url?: string | null;
  profile_completed?: boolean;
  account_status?: string;
  role?: string;
}) {
  if (!isSupabaseConfigured) {
    return { data: null, error: { message: 'Supabase is not configured.' } };
  }

  return supabase.from('profiles').upsert(profile).select('*').single();
}
