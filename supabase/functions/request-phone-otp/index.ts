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
      console.warn("request_phone_otp_invalid_phone", { userId: user.id });
      return json({ error: "A valid phone number is required." }, 400);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!isValidGhanaInternationalNumber(normalizedPhoneNumber)) {
      console.warn("request_phone_otp_invalid_recipient_format", {
        userId: user.id,
        rawPhoneNumber: phoneNumber,
        normalizedPhoneNumber,
      });
      return json({
        ok: false,
        error: "SMS delivery failed. Invalid recipient format.",
        reason: "invalid_recipient_format",
        rawPhoneNumber: phoneNumber,
        normalizedPhoneNumber,
      }, 400);
    }

    console.log("request_phone_otp_started", {
      userId: user.id,
      normalizedPhoneNumber,
      phoneLast4: normalizedPhoneNumber.slice(-4),
    });
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

    if (profileError) {
      console.error("request_phone_otp_profile_update_failed", {
        userId: user.id,
        error: profileError.message,
      });
      return json({ error: profileError.message, reason: "profile_update_failed" }, 500);
    }

    const hubtelResult = await sendHubtelOtp(normalizedPhoneNumber, otp, reference);
    if (!hubtelResult.ok) {
      console.error("request_phone_otp_hubtel_send_failed", {
        userId: user.id,
        normalizedPhoneNumber,
        status: hubtelResult.status,
        error: hubtelResult.error,
      });
      return json({
        ok: false,
        error: hubtelResult.error,
        reason: "hubtel_send_failed",
        rawPhoneNumber: phoneNumber,
        normalizedPhoneNumber,
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

    if (upsertError) {
      console.error("request_phone_otp_upsert_failed", {
        userId: user.id,
        error: upsertError.message,
      });
      return json({ error: upsertError.message, reason: "verification_upsert_failed" }, 500);
    }

    console.log("request_phone_otp_sent", {
      userId: user.id,
      providerReference: reference,
      normalizedPhoneNumber,
      phoneLast4: normalizedPhoneNumber.slice(-4),
    });

    return json({
      status: nextStatus,
      providerReference: reference,
      rawPhoneNumber: phoneNumber,
      normalizedPhoneNumber,
      message: "Hubtel OTP sent. Enter the code to verify your phone.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});

function normalizePhoneNumber(phoneNumber: string) {
  const compact = phoneNumber.replace(/\D/g, "");
  if (compact.startsWith("0")) return `233${compact.slice(1)}`;
  if (compact.startsWith("233")) return compact;
  if (compact.length === 9) return `233${compact}`;
  return compact;
}

function isValidGhanaInternationalNumber(phoneNumber: string) {
  return /^233\d{9}$/.test(phoneNumber);
}

function generateOtp() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

async function sendHubtelOtp(phoneNumber: string, otp: string, reference: string) {
  const sendUrl = "https://smsc.hubtel.com/v1/messages/send";
  const senderId = Deno.env.get("HUBTEL_SENDER_ID") ?? "";
  const clientId = Deno.env.get("HUBTEL_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("HUBTEL_CLIENT_SECRET") ?? "";

  if (!senderId || !clientId || !clientSecret) {
    return {
      ok: false,
      status: 500,
      error: "Hubtel OTP is not configured. Set HUBTEL_CLIENT_ID, HUBTEL_CLIENT_SECRET, and HUBTEL_SENDER_ID in Supabase Edge Function secrets.",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
  };

  if (!isValidGhanaInternationalNumber(phoneNumber)) {
    return {
      ok: false,
      status: 400,
      error: "SMS delivery failed. Invalid recipient format.",
    };
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

  const responseText = await response.text();
  const hubtelStatus = readHubtelStatus(responseText);
  if (!response.ok || hubtelStatus === "rejected") {
    return {
      ok: false,
      status: hubtelStatus === "rejected" ? 400 : 502,
      error: hubtelStatus === "rejected"
        ? "SMS delivery failed. Invalid recipient format."
        : responseText || "Hubtel rejected the OTP request.",
    };
  }

  return { ok: true, status: 200, error: "" };
}

function readHubtelStatus(responseText: string) {
  const text = responseText.toLowerCase();
  if (text.includes("rejected") || text.includes("invalid recipient")) return "rejected";

  try {
    const body = JSON.parse(responseText);
    const status = String(body.Status ?? body.status ?? body.MessageStatus ?? body.messageStatus ?? "").toLowerCase();
    if (status === "rejected") return "rejected";
  } catch {
    // Hubtel may return non-JSON for transport failures; the text check above handles common rejection bodies.
  }

  return "";
}
