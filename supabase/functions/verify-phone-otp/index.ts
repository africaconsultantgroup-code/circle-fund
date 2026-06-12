import { getAuthedServiceClient, hashSensitiveValue, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { phoneNumber, otp, otpReference } = await req.json();
    if (typeof phoneNumber !== "string" || typeof otp !== "string" || otp.trim().length !== 6) {
      console.warn("verify_phone_otp_invalid_payload", { userId: user.id });
      return json({ error: "A phone number and OTP are required." }, 400);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (!isValidGhanaInternationalNumber(normalizedPhoneNumber)) {
      console.warn("verify_phone_otp_invalid_recipient_format", {
        userId: user.id,
        rawPhoneNumber: phoneNumber,
        normalizedPhoneNumber,
      });
      return json({
        ok: false,
        error: "Invalid phone number format.",
        reason: "invalid_recipient_format",
        normalizedPhoneNumber,
      }, 400);
    }

    console.log("verify_phone_otp_started", {
      userId: user.id,
      otpReference: typeof otpReference === "string" ? otpReference : null,
      normalizedPhoneNumber,
      phoneLast4: normalizedPhoneNumber.slice(-4),
      hasOtpReference: typeof otpReference === "string",
    });
    const now = new Date();
    const reference = providerReference("phone_verify");
    const { data: existingVerification, error: existingVerificationError } = await serviceClient
      .from("user_verifications")
      .select("user_id, phone_number, phone_verified, ghana_card_verified, face_verified, verification_status, otp_status, otp_code_hash, otp_expires_at, otp_reference")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError) return json({ error: existingVerificationError.message }, 500);
    console.log("verify_phone_otp_record_lookup", {
      userId: user.id,
      requestedOtpReference: typeof otpReference === "string" ? otpReference : null,
      savedOtpReference: existingVerification?.otp_reference ?? null,
      phoneNumber: existingVerification?.phone_number ?? normalizedPhoneNumber,
      expiryTime: existingVerification?.otp_expires_at ?? null,
      databaseRecordFound: Boolean(existingVerification),
      hasOtpHash: Boolean(existingVerification?.otp_code_hash),
      otpStatus: existingVerification?.otp_status ?? null,
    });

    if (!existingVerification?.otp_code_hash || !existingVerification.otp_expires_at) {
      if (existingVerification?.phone_verified && existingVerification.otp_status === "verified") {
        console.log("verify_phone_otp_already_verified", {
          userId: user.id,
          requestedOtpReference: typeof otpReference === "string" ? otpReference : null,
          savedOtpReference: existingVerification.otp_reference,
          phoneNumber: existingVerification.phone_number ?? normalizedPhoneNumber,
          databaseRecordFound: true,
        });

        return json({
          ok: true,
          status: existingVerification.verification_status,
          providerReference: reference,
          message: "Phone number already verified. Taking you to the next verification step.",
        });
      }

      console.warn("verify_phone_otp_no_active_request", {
        userId: user.id,
        requestedOtpReference: typeof otpReference === "string" ? otpReference : null,
        savedOtpReference: existingVerification?.otp_reference ?? null,
        phoneNumber: existingVerification?.phone_number ?? normalizedPhoneNumber,
        expiryTime: existingVerification?.otp_expires_at ?? null,
        databaseRecordFound: Boolean(existingVerification),
        hasOtpHash: Boolean(existingVerification?.otp_code_hash),
      });
      return json({ ok: false, error: "No active OTP request found. Please request a new code.", reason: "otp_request_missing" }, 400);
    }

    if (typeof otpReference === "string" && existingVerification.otp_reference && otpReference !== existingVerification.otp_reference) {
      console.warn("verify_phone_otp_reference_mismatch", {
        userId: user.id,
        requestedOtpReference: otpReference,
        savedOtpReference: existingVerification.otp_reference,
        phoneNumber: existingVerification.phone_number ?? normalizedPhoneNumber,
        expiryTime: existingVerification.otp_expires_at,
      });
      return json({ ok: false, error: "Invalid OTP. Please try again.", reason: "otp_reference_mismatch" }, 400);
    }

    if (new Date(existingVerification.otp_expires_at).getTime() < now.getTime()) {
      await markOtpFailed(serviceClient, user.id, existingVerification.phone_number ?? normalizedPhoneNumber);
      console.warn("verify_phone_otp_expired", {
        userId: user.id,
        otpReference: existingVerification.otp_reference,
        phoneNumber: existingVerification.phone_number ?? normalizedPhoneNumber,
        expiryTime: existingVerification.otp_expires_at,
      });
      return json({ ok: false, error: "OTP expired. Please request a new code.", reason: "otp_expired" }, 400);
    }

    const storedPhoneNumber = existingVerification.phone_number ?? normalizedPhoneNumber;
    const otpHash = await hashSensitiveValue(`${storedPhoneNumber}:${otp.trim()}`);
    if (otpHash !== existingVerification.otp_code_hash) {
      await markOtpFailed(serviceClient, user.id, storedPhoneNumber);
      console.warn("verify_phone_otp_invalid_code", {
        userId: user.id,
        otpReference: existingVerification.otp_reference,
        phoneNumber: storedPhoneNumber,
        expiryTime: existingVerification.otp_expires_at,
      });
      return json({ ok: false, error: "Invalid OTP. Please try again.", reason: "otp_invalid" }, 400);
    }

    const status = resolveAggregateStatus(existingVerification);

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({ phone: storedPhoneNumber, updated_at: now.toISOString() })
      .eq("user_id", user.id);

    if (profileError) {
      console.error("verify_phone_otp_profile_update_failed", {
        userId: user.id,
        error: profileError.message,
      });
      return json({ error: profileError.message, reason: "profile_update_failed" }, 500);
    }

    const { data: verifiedRecord, error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        phone_number: storedPhoneNumber,
        phone_verified: true,
        otp_status: "verified",
        otp_reference: existingVerification.otp_reference ?? reference,
        otp_verified_at: now.toISOString(),
        otp_code_hash: null,
        otp_expires_at: null,
        verification_provider: "hubtel_otp",
        provider_reference: reference,
        verification_status: status,
        failure_reason: null,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" })
      .select("user_id, phone_number, phone_verified, otp_status, otp_verified_at, otp_reference, verification_status")
      .single();

    if (upsertError) {
      console.error("verify_phone_otp_upsert_failed", {
        userId: user.id,
        error: upsertError.message,
      });
      return json({ error: upsertError.message, reason: "verification_upsert_failed" }, 500);
    }

    console.log("verify_phone_otp_success", {
      userId: verifiedRecord.user_id,
      providerReference: reference,
      otpReference: verifiedRecord.otp_reference,
      phoneNumber: verifiedRecord.phone_number,
      phoneVerified: verifiedRecord.phone_verified,
      otpStatus: verifiedRecord.otp_status,
      otpVerifiedAt: verifiedRecord.otp_verified_at,
      expiryTime: existingVerification.otp_expires_at,
    });

    return json({
      ok: true,
      status: verifiedRecord.verification_status,
      phoneVerified: verifiedRecord.phone_verified,
      otpStatus: verifiedRecord.otp_status,
      otpVerifiedAt: verifiedRecord.otp_verified_at,
      providerReference: reference,
      message: status === "verified"
        ? "Phone number verified. Verification is complete."
        : "Phone number verified. Continue to the next verification step.",
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

async function markOtpFailed(serviceClient: any, userId: string, phoneNumber: string) {
  await serviceClient
    .from("user_verifications")
    .upsert({
      user_id: userId,
      phone_number: phoneNumber,
      phone_verified: false,
      otp_status: "failed",
      failure_reason: "Invalid OTP. Please try again.",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
}

function resolveAggregateStatus(existingVerification: {
  user_id: string;
  phone_number: string | null;
  phone_verified: boolean;
  ghana_card_verified: boolean;
  face_verified: boolean;
  verification_status: string;
  otp_status: string;
  otp_code_hash: string | null;
  otp_expires_at: string | null;
  otp_reference: string | null;
} | null) {
  if (
    existingVerification?.ghana_card_verified &&
    existingVerification.face_verified &&
    existingVerification.verification_status === "verified"
  ) {
    return "verified";
  }

  return existingVerification?.verification_status === "manual_review" ? "manual_review" : "pending";
}
