import { getAuthedServiceClient, hashSensitiveValue, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { phoneNumber, countryCode } = await req.json();
    if (typeof phoneNumber !== "string" || phoneNumber.trim().length < 8) {
      console.warn("request_phone_otp_invalid_phone", { userId: user.id });
      return json({ error: "A valid phone number is required." }, 400);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber, typeof countryCode === "string" ? countryCode : undefined);
    const detectedCountry = detectCountry(normalizedPhoneNumber);
    if (!isValidInternationalPhoneNumber(normalizedPhoneNumber)) {
      console.warn("request_phone_otp_invalid_recipient_format", {
        userId: user.id,
        rawPhoneNumber: phoneNumber,
        normalizedPhoneNumber,
        detectedCountry,
        countryCode,
      });
      return json({
        ok: false,
        error: "Invalid phone number format.",
        reason: "invalid_recipient_format",
        rawPhoneNumber: phoneNumber,
        normalizedPhoneNumber,
        detectedCountry,
      }, 400);
    }

    const otpRoute = resolveOtpProvider(normalizedPhoneNumber, detectedCountry);
    console.log("request_phone_otp_started", {
      userId: user.id,
      rawPhoneInput: phoneNumber,
      normalizedPhoneNumber,
      detectedCountry,
      otpProvider: otpRoute.provider,
      testOtpMode: otpRoute.testOtpMode,
      phoneLast4: normalizedPhoneNumber.slice(-4),
    });
    const now = new Date();
    const reference = providerReference("phone_otp");
    const status = "pending";
    const otp = otpRoute.testOtpMode ? "000000" : generateOtp();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const otpHash = await hashSensitiveValue(`${normalizedPhoneNumber}:${otp}`);
    const failureReason = otpRoute.testOtpMode
      ? "Diaspora Test OTP mode. SMS was not sent. Awaiting user verification."
      : `${otpRoute.providerLabel} OTP sent. Awaiting user verification.`;
    const { data: existingVerification, error: existingVerificationError } = await serviceClient
      .from("user_verifications")
      .select("phone_verified, verification_status, otp_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError) return json({ error: existingVerificationError.message }, 500);

    const nextStatus = existingVerification?.verification_status === "verified" ? "verified" : status;

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({
        phone: normalizedPhoneNumber,
        updated_at: now.toISOString(),
      })
      .eq("user_id", user.id);

    if (profileError) {
      console.error("request_phone_otp_profile_update_failed", {
        userId: user.id,
        error: profileError.message,
      });
      return json({ error: profileError.message, reason: "profile_update_failed" }, 500);
    }

    const { data: savedVerification, error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        phone_number: normalizedPhoneNumber,
        phone_verified: false,
        otp_status: status,
        otp_reference: reference,
        otp_code_hash: otpHash,
        otp_expires_at: expiresAt.toISOString(),
        verification_provider: otpRoute.provider,
        is_test_verification: otpRoute.testOtpMode,
        provider_reference: reference,
        verification_status: nextStatus,
        failure_reason: failureReason,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" })
      .select("user_id, phone_number, otp_reference, otp_status, otp_expires_at, otp_code_hash")
      .single();

    if (upsertError) {
      console.error("request_phone_otp_upsert_failed", {
        userId: user.id,
        otpReference: reference,
        phoneNumber: normalizedPhoneNumber,
        expiryTime: expiresAt.toISOString(),
        error: upsertError.message,
      });
      return json({ error: upsertError.message, reason: "verification_upsert_failed" }, 500);
    }

    console.log("request_phone_otp_record_saved", {
      userId: savedVerification.user_id,
      otpReference: savedVerification.otp_reference,
      phoneNumber: savedVerification.phone_number,
      expiryTime: savedVerification.otp_expires_at,
      databaseRecordFound: Boolean(savedVerification),
      hasOtpHash: Boolean(savedVerification.otp_code_hash),
      otpStatus: savedVerification.otp_status,
    });

    let deliveryStatus = otpRoute.testOtpMode ? "test_otp_created" : "pending";
    let hubtelResponse: unknown = null;
    if (otpRoute.provider === "hubtel_otp" || otpRoute.provider === "hubtel_international_otp") {
      const hubtelResult = await sendHubtelOtp(normalizedPhoneNumber, otp, reference, otpRoute.allowHubtelInternational);
      deliveryStatus = hubtelResult.deliveryStatus ?? (hubtelResult.ok ? "accepted" : "failed");
      hubtelResponse = hubtelResult.responseBody ?? hubtelResult.error;
      if (!hubtelResult.ok) {
        console.error("request_phone_otp_hubtel_send_failed", {
          userId: user.id,
          rawPhoneInput: phoneNumber,
          otpReference: reference,
          phoneNumber: normalizedPhoneNumber,
          detectedCountry,
          otpProvider: otpRoute.provider,
          expiryTime: expiresAt.toISOString(),
          status: hubtelResult.status,
          deliveryStatus,
          hubtelResponse,
          error: hubtelResult.error,
        });

        await markOtpDeliveryFailed(serviceClient, user.id, normalizedPhoneNumber, hubtelResult.error);

        return json({
          ok: false,
          error: hubtelResult.error,
          reason: "hubtel_send_failed",
          rawPhoneNumber: phoneNumber,
          normalizedPhoneNumber,
          detectedCountry,
          otpProvider: otpRoute.provider,
          deliveryStatus,
          hubtelResponse,
        }, hubtelResult.status);
      }
    }

    console.log("request_phone_otp_delivery_result", {
      userId: user.id,
      rawPhoneInput: phoneNumber,
      otpReference: reference,
      phoneNumber: normalizedPhoneNumber,
      detectedCountry,
      otpProvider: otpRoute.provider,
      deliveryStatus,
      hubtelResponse,
      expiryTime: expiresAt.toISOString(),
      phoneLast4: normalizedPhoneNumber.slice(-4),
    });

    return json({
      status: nextStatus,
      providerReference: reference,
      rawPhoneNumber: phoneNumber,
      normalizedPhoneNumber,
      detectedCountry,
      otpProvider: otpRoute.provider,
      deliveryStatus,
      hubtelResponse,
      testOtpMode: otpRoute.testOtpMode,
      testOtp: otpRoute.testOtpMode ? "000000" : undefined,
      message: otpRoute.testOtpMode
        ? "International SMS is not live yet. Use test OTP for preview access."
        : `${otpRoute.providerLabel} OTP sent. Enter the code to verify your phone.`,
      testModeLabel: otpRoute.testOtpMode ? "Test OTP only — not for production verification." : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});

function normalizePhoneNumber(phoneNumber: string, countryCode = "") {
  const compact = phoneNumber.replace(/\D/g, "");
  const country = countryCode.trim().toUpperCase();
  const hasPlusPrefix = phoneNumber.trim().startsWith("+");

  if (!compact) return "";
  if (hasPlusPrefix) return compact;

  if (country === "GH") {
    if (compact.startsWith("0")) return `233${compact.slice(1)}`;
    if (compact.startsWith("233")) return compact;
    if (compact.length === 9) return `233${compact}`;
  }

  if (country === "GB" || country === "UK") {
    if (compact.startsWith("0")) return `44${compact.slice(1)}`;
    if (compact.startsWith("44")) return compact;
  }

  if (country === "US" || country === "CA") {
    if (compact.startsWith("1") && compact.length === 11) return compact;
    if (compact.length === 10) return `1${compact}`;
  }

  if (compact.startsWith("0")) return `233${compact.slice(1)}`;
  if (compact.startsWith("233")) return compact;
  if (compact.length === 9) return `233${compact}`;
  if (compact.startsWith("44")) return compact;
  if (compact.startsWith("1") && compact.length === 11) return compact;
  if (compact.length === 10) return `1${compact}`;
  return compact;
}

function isValidInternationalPhoneNumber(phoneNumber: string) {
  return /^233\d{9}$/.test(phoneNumber)
    || /^44\d{9,10}$/.test(phoneNumber)
    || /^1\d{10}$/.test(phoneNumber)
    || /^(?!233|44|1)\d{8,15}$/.test(phoneNumber);
}

function detectCountry(phoneNumber: string) {
  if (/^233\d{9}$/.test(phoneNumber)) return "GH";
  if (/^44\d{9,10}$/.test(phoneNumber)) return "GB";
  if (/^1\d{10}$/.test(phoneNumber)) return "US_CA";
  if (/^\d{8,15}$/.test(phoneNumber)) return "OTHER";
  return "UNKNOWN";
}

function resolveOtpProvider(phoneNumber: string, detectedCountry: string) {
  const hubtelInternationalEnabled = (Deno.env.get("HUBTEL_ENABLE_INTERNATIONAL_SMS") ?? "").toLowerCase() === "true";
  const futureProvider = (Deno.env.get("INTERNATIONAL_SMS_PROVIDER") ?? "").trim().toLowerCase();

  if (detectedCountry === "GH") {
    return {
      provider: "hubtel_otp",
      providerLabel: "Hubtel",
      allowHubtelInternational: false,
      testOtpMode: false,
    };
  }

  if (hubtelInternationalEnabled) {
    return {
      provider: "hubtel_international_otp",
      providerLabel: "Hubtel international",
      allowHubtelInternational: true,
      testOtpMode: false,
    };
  }

  return {
    provider: "diaspora_test_otp",
    providerLabel: futureProvider ? `${futureProvider} test` : "Diaspora test",
    allowHubtelInternational: false,
    testOtpMode: true,
  };
}

function generateOtp() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

async function markOtpDeliveryFailed(serviceClient: any, userId: string, phoneNumber: string, failureReason: string) {
  await serviceClient
    .from("user_verifications")
    .update({
      phone_number: phoneNumber,
      phone_verified: false,
      otp_status: "failed",
      otp_code_hash: null,
      otp_expires_at: null,
      failure_reason: failureReason,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

async function sendHubtelOtp(phoneNumber: string, otp: string, reference: string, allowInternational = false) {
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

  if (!allowInternational && !/^233\d{9}$/.test(phoneNumber)) {
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
  console.log("request_phone_otp_hubtel_response", {
    phoneNumber,
    reference,
    httpStatus: response.status,
    deliveryStatus: hubtelStatus || (response.ok ? "accepted" : "failed"),
    responseText,
  });
  if (!response.ok || hubtelStatus === "rejected") {
    return {
      ok: false,
      status: hubtelStatus === "rejected" ? 400 : 502,
      error: hubtelStatus === "rejected"
        ? "SMS delivery failed. Invalid recipient format."
        : responseText || "Hubtel rejected the OTP request.",
      deliveryStatus: hubtelStatus || "failed",
      responseBody: responseText,
    };
  }

  return {
    ok: true,
    status: 200,
    error: "",
    deliveryStatus: hubtelStatus || "accepted",
    responseBody: responseText,
  };
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
