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
      .select("id, user_id, phone_number, phone_verified, phone_verified_at, ghana_card_verified, face_verified, verification_status, otp_status, otp_verified_at, otp_code_hash, otp_expires_at, otp_reference")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError) return json({ error: existingVerificationError.message }, 500);
    console.log("verify_phone_otp_record_lookup", {
      userId: user.id,
      verificationRecordId: existingVerification?.id ?? null,
      requestedOtpReference: typeof otpReference === "string" ? otpReference : null,
      savedOtpReference: existingVerification?.otp_reference ?? null,
      phoneNumber: existingVerification?.phone_number ?? normalizedPhoneNumber,
      expiryTime: existingVerification?.otp_expires_at ?? null,
      databaseRecordFound: Boolean(existingVerification),
      hasOtpHash: Boolean(existingVerification?.otp_code_hash),
      otpStatus: existingVerification?.otp_status ?? null,
    });

    if (!existingVerification?.otp_code_hash || !existingVerification.otp_expires_at) {
      if (existingVerification?.phone_verified) {
        const repairedRecord = existingVerification.otp_status === "verified"
          ? existingVerification
          : await repairVerifiedPhoneStatus(serviceClient, user.id, existingVerification.phone_number ?? normalizedPhoneNumber, now);

        await serviceClient
          .from("profiles")
          .update({
            phone: repairedRecord.phone_number ?? normalizedPhoneNumber,
            updated_at: now.toISOString(),
          })
          .eq("user_id", user.id);

        console.log("verify_phone_otp_already_verified", {
          userId: user.id,
          verificationRecordId: repairedRecord.id,
          requestedOtpReference: typeof otpReference === "string" ? otpReference : null,
          savedOtpReference: repairedRecord.otp_reference,
          phoneNumber: repairedRecord.phone_number ?? normalizedPhoneNumber,
          otpStatus: repairedRecord.otp_status,
          otpVerifiedAt: repairedRecord.otp_verified_at,
          databaseRecordFound: true,
        });

        return json({
          ok: true,
          status: repairedRecord.verification_status,
          phoneVerified: repairedRecord.phone_verified,
          otpStatus: repairedRecord.otp_status,
          otpVerifiedAt: repairedRecord.otp_verified_at,
          providerReference: reference,
          message: "Phone number already verified. Taking you to the next verification step.",
        });
      }

      console.warn("verify_phone_otp_no_active_request", {
        userId: user.id,
        verificationRecordId: existingVerification?.id ?? null,
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
        verificationRecordId: existingVerification.id,
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
        verificationRecordId: existingVerification.id,
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
        verificationRecordId: existingVerification.id,
        otpReference: existingVerification.otp_reference,
        phoneNumber: storedPhoneNumber,
        expiryTime: existingVerification.otp_expires_at,
      });
      return json({ ok: false, error: "Invalid OTP. Please try again.", reason: "otp_invalid" }, 400);
    }

    const status = resolveAggregateStatus(existingVerification);

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({
        phone: storedPhoneNumber,
        updated_at: now.toISOString(),
      })
      .eq("user_id", user.id);

    if (profileError) {
      console.error("verify_phone_otp_profile_update_failed", {
        userId: user.id,
        error: profileError.message,
      });
      return json({ error: profileError.message, reason: "profile_update_failed" }, 500);
    }

    const verificationPatch = {
      user_id: user.id,
      phone_number: storedPhoneNumber,
      phone_verified: true,
      phone_verified_at: now.toISOString(),
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
    };

    console.log("verify_phone_otp_update_attempt", {
      userId: user.id,
      verificationRecordId: existingVerification.id,
      updateMode: "service_role_upsert_by_user_id",
      updatePayload: {
        phone_number: verificationPatch.phone_number,
        phone_verified: verificationPatch.phone_verified,
        phone_verified_at: verificationPatch.phone_verified_at,
        otp_status: verificationPatch.otp_status,
        otp_verified_at: verificationPatch.otp_verified_at,
      },
    });

    const { data: verifiedRecord, error: updateError } = await serviceClient
      .from("user_verifications")
      .upsert(verificationPatch, { onConflict: "user_id" })
      .select("id, user_id, phone_number, phone_verified, phone_verified_at, otp_status, otp_verified_at, otp_reference, verification_status")
      .maybeSingle();

    if (updateError) {
      console.error("verify_phone_otp_update_failed", {
        userId: user.id,
        verificationRecordId: existingVerification.id,
        error: updateError.message,
      });
      return json({ error: updateError.message, reason: "verification_update_failed" }, 500);
    }

    if (!verifiedRecord) {
      console.error("verify_phone_otp_row_not_updated", {
        userId: user.id,
        verificationRecordId: existingVerification.id,
      });
      return json({ error: "Verification row not updated", reason: "verification_row_not_updated" }, 500);
    }

    console.log("verify_phone_otp_update_result", {
      userId: verifiedRecord.user_id,
      verificationRecordId: verifiedRecord.id,
      phoneNumber: verifiedRecord.phone_number,
      phoneVerified: verifiedRecord.phone_verified,
      phoneVerifiedAt: verifiedRecord.phone_verified_at,
      otpStatus: verifiedRecord.otp_status,
      otpVerifiedAt: verifiedRecord.otp_verified_at,
    });

    if (!verifiedRecord.phone_verified || verifiedRecord.otp_status !== "verified" || !verifiedRecord.otp_verified_at) {
      console.error("verify_phone_otp_update_not_persisted", {
        userId: verifiedRecord.user_id,
        phoneNumber: verifiedRecord.phone_number,
        phoneVerified: verifiedRecord.phone_verified,
        otpStatus: verifiedRecord.otp_status,
        otpVerifiedAt: verifiedRecord.otp_verified_at,
      });
      return json({
        ok: false,
        error: "Phone verification did not persist. Please try again.",
        reason: "otp_update_not_persisted",
        phoneVerified: verifiedRecord.phone_verified,
        otpStatus: verifiedRecord.otp_status,
        otpVerifiedAt: verifiedRecord.otp_verified_at,
      }, 500);
    }

    const { data: refreshedVerification, error: refreshError } = await serviceClient
      .from("user_verifications")
      .select("id, user_id, phone_number, phone_verified, phone_verified_at, otp_status, otp_verified_at, ghana_card_status, face_status, verification_status")
      .eq("user_id", user.id)
      .single();

    if (refreshError) {
      console.error("verify_phone_otp_refresh_failed", {
        userId: user.id,
        verificationRecordId: verifiedRecord.id,
        error: refreshError.message,
      });
      return json({ error: refreshError.message, reason: "verification_refresh_failed" }, 500);
    }

    console.log("verify_phone_otp_refreshed_state", {
      userId: refreshedVerification.user_id,
      verificationRecordId: refreshedVerification.id,
      phoneNumber: refreshedVerification.phone_number,
      phoneVerified: refreshedVerification.phone_verified,
      phoneVerifiedAt: refreshedVerification.phone_verified_at,
      otpStatus: refreshedVerification.otp_status,
      otpVerifiedAt: refreshedVerification.otp_verified_at,
      ghanaCardStatus: refreshedVerification.ghana_card_status,
      selfieStatus: refreshedVerification.face_status,
      verificationStatus: refreshedVerification.verification_status,
    });

    console.log("verify_phone_otp_success", {
      userId: refreshedVerification.user_id,
      verificationRecordId: refreshedVerification.id,
      providerReference: reference,
      otpReference: verifiedRecord.otp_reference,
      phoneNumber: refreshedVerification.phone_number,
      phoneVerified: refreshedVerification.phone_verified,
      phoneVerifiedAt: refreshedVerification.phone_verified_at,
      otpStatus: refreshedVerification.otp_status,
      otpVerifiedAt: refreshedVerification.otp_verified_at,
      expiryTime: existingVerification.otp_expires_at,
    });

    return json({
      ok: true,
      status: refreshedVerification.verification_status,
      phoneVerified: refreshedVerification.phone_verified,
      phoneVerifiedAt: refreshedVerification.phone_verified_at,
      otpStatus: refreshedVerification.otp_status,
      otpVerifiedAt: refreshedVerification.otp_verified_at,
      updatedVerification: refreshedVerification,
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

async function repairVerifiedPhoneStatus(serviceClient: any, userId: string, phoneNumber: string, now: Date) {
  const { data, error } = await serviceClient
    .from("user_verifications")
    .update({
      phone_number: phoneNumber,
      phone_verified: true,
      phone_verified_at: now.toISOString(),
      otp_status: "verified",
      otp_verified_at: now.toISOString(),
      failure_reason: null,
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .select("id, user_id, phone_number, phone_verified, phone_verified_at, otp_status, otp_verified_at, otp_reference, verification_status")
    .single();

  if (error) {
    throw new Error(`Unable to repair verified phone OTP status: ${error.message}`);
  }

  return data;
}

function resolveAggregateStatus(existingVerification: {
  user_id: string;
  id: string;
  phone_number: string | null;
  phone_verified: boolean;
  phone_verified_at?: string | null;
  ghana_card_verified: boolean;
  face_verified: boolean;
  verification_status: string;
  otp_status: string;
  otp_verified_at?: string | null;
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
