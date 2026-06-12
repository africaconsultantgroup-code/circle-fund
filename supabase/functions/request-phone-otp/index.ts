import { getAuthedServiceClient, hashSensitiveValue, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { phoneNumber } = await req.json();
    if (typeof phoneNumber !== "string" || phoneNumber.trim().length < 8) {
      return json({ error: "A valid phone number is required." }, 400);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const now = new Date();
    const reference = providerReference("phone_otp");
    const status = "pending";
    const otp = generateOtp();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const otpHash = await hashSensitiveValue(`${normalizedPhoneNumber}:${otp}`);
    const failureReason = "Hubtel OTP sent. Awaiting user verification.";
    const { data: existingVerification, error: existingVerificationError } = await serviceClient
      .from("user_verifications")
      .select("phone_verified, verification_status, otp_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError) return json({ error: existingVerificationError.message }, 500);

    const phoneAlreadyVerified = existingVerification?.phone_verified === true;
    const nextStatus = existingVerification?.verification_status === "verified" ? "verified" : status;

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({ phone: normalizedPhoneNumber, updated_at: now.toISOString() })
      .eq("user_id", user.id);

    if (profileError) return json({ error: profileError.message }, 500);

    const hubtelResult = await sendHubtelOtp(normalizedPhoneNumber, otp, reference);
    if (!hubtelResult.ok) {
      return json({
        ok: false,
        error: hubtelResult.error,
      }, hubtelResult.status);
    }

    const { error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        phone_number: normalizedPhoneNumber,
        phone_verified: phoneAlreadyVerified,
        otp_status: phoneAlreadyVerified ? "verified" : status,
        otp_reference: reference,
        otp_code_hash: phoneAlreadyVerified ? null : otpHash,
        otp_expires_at: phoneAlreadyVerified ? null : expiresAt.toISOString(),
        verification_provider: "hubtel_otp",
        provider_reference: reference,
        verification_status: nextStatus,
        failure_reason: phoneAlreadyVerified ? null : failureReason,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({
      status: nextStatus,
      providerReference: reference,
      message: "Hubtel OTP sent. Enter the code to verify your phone.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});

function normalizePhoneNumber(phoneNumber: string) {
  const compact = phoneNumber.replace(/[\s()-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("0")) return `+233${compact.slice(1)}`;
  if (compact.startsWith("233")) return `+${compact}`;
  return compact;
}

function generateOtp() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

async function sendHubtelOtp(phoneNumber: string, otp: string, reference: string) {
  const sendUrl = Deno.env.get("HUBTEL_SMS_SEND_URL") ?? Deno.env.get("HUBTEL_OTP_SEND_URL") ?? "";
  const senderId = Deno.env.get("HUBTEL_SENDER_ID") ?? "SikaCircle";
  const clientId = Deno.env.get("HUBTEL_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("HUBTEL_CLIENT_SECRET") ?? "";
  const bearerToken = Deno.env.get("HUBTEL_BEARER_TOKEN") ?? "";

  if (!sendUrl || (!bearerToken && (!clientId || !clientSecret))) {
    return {
      ok: false,
      status: 500,
      error: "Hubtel OTP is not configured. Set HUBTEL_SMS_SEND_URL and Hubtel credentials in Supabase secrets.",
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  }

  const response = await fetch(sendUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      From: senderId,
      To: phoneNumber,
      Content: `Your SikaCircle verification code is ${otp}. It expires in 10 minutes.`,
      ClientReference: reference,
      RegisteredDelivery: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      status: 502,
      error: text || "Hubtel rejected the OTP request.",
    };
  }

  return { ok: true, status: 200, error: "" };
}
