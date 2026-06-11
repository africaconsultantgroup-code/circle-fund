import { getAuthedServiceClient, hashSensitiveValue, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { ghanaCardNumber } = await req.json();
    const normalizedCardNumber = typeof ghanaCardNumber === "string" ? ghanaCardNumber.trim().toUpperCase() : "";
    if (!isValidGhanaCardNumber(normalizedCardNumber)) {
      return json({
        ok: false,
        error: "Enter a valid Ghana Card number, for example GHA-123456789-1.",
      });
    }

    const reference = providerReference("ghana_card_review");
    const ghanaCardNumberHash = await hashSensitiveValue(normalizedCardNumber);
    const failureReason = "Live Ghana Card provider is not connected. Submitted for admin review.";
    const { data: existingVerification, error: existingVerificationError } = await serviceClient
      .from("user_verifications")
      .select("ghana_card_verified, face_verified, verification_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError) return json({ ok: false, error: existingVerificationError.message }, 500);

    const cardAlreadyVerified = existingVerification?.ghana_card_verified === true;
    const status = resolveAggregateStatus(existingVerification);
    const ghanaCardStatus = cardAlreadyVerified ? "verified" : "pending";

    const { error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        ghana_card_number_hash: ghanaCardNumberHash,
        ghana_card_verified: cardAlreadyVerified,
        ghana_card_status: ghanaCardStatus,
        verification_provider: "admin_review",
        provider_reference: reference,
        verification_status: status,
        failure_reason: status === "verified" ? null : failureReason,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      return json({
        ok: false,
        error: upsertError.message,
      });
    }

    return json({
      ok: true,
      status,
      providerReference: reference,
      message: "Ghana Card submitted for review.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ ok: false, error: message });
  }
});

function resolveAggregateStatus(existingVerification: {
  ghana_card_verified: boolean;
  face_verified: boolean;
  verification_status: string;
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

function isValidGhanaCardNumber(value: string) {
  return /^GHA-\d{9}-\d$/.test(value) || /^GHA\d{10}$/.test(value);
}
