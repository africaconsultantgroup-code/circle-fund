import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-admin-verification-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type VerificationStatus = "not_started" | "pending" | "verified" | "failed" | "manual_review";

export async function getAuthedServiceClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return { user: null, serviceClient: null, error: json({ error: "Unauthorized" }, 401) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  return { user: data.user, serviceClient, error: null };
}

export async function hashSensitiveValue(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function providerConfig() {
  return {
    baseUrl: Deno.env.get("NIA_API_BASE_URL") ?? "",
    apiKey: Deno.env.get("NIA_API_KEY") ?? "",
    clientId: Deno.env.get("NIA_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("NIA_CLIENT_SECRET") ?? "",
  };
}

export function providerReference(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function isOptions(req: Request) {
  return req.method === "OPTIONS";
}

export function providerConfigured() {
  const config = providerConfig();
  return Boolean(config.baseUrl && config.apiKey && config.clientId && config.clientSecret);
}

export async function callOfficialNiaVerificationProvider(_payload: Record<string, unknown>) {
  throw new Error("Official NIA/provider API integration is not enabled until credentials and contract are confirmed.");
}
