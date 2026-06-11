import { getAuthedServiceClient, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { selfieCaptureReference } = await req.json();
    if (typeof selfieCaptureReference !== "string" || selfieCaptureReference.trim().length < 6) {
      return json({ error: "A selfie capture reference is required. Raw selfie images should not be sent to this placeholder function." }, 400);
    }

    const reference = providerReference("selfie_review");
    const failureReason = "Live face verification provider is not connected. Submitted for admin review.";
    const { data: existingVerification, error: existingVerificationError } = await serviceClient
      .from("user_verifications")
      .select("ghana_card_verified, face_verified, verification_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingVerificationError) return json({ error: existingVerificationError.message }, 500);

    const faceAlreadyVerified = existingVerification?.face_verified === true;
    const status = resolveAggregateStatus(existingVerification);
    const faceStatus = faceAlreadyVerified ? "verified" : "manual_review";

    const { error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        selfie_uploaded: true,
        face_verified: faceAlreadyVerified,
        face_status: faceStatus,
        verification_provider: "admin_review",
        provider_reference: reference,
        verification_status: status,
        failure_reason: status === "verified" ? null : failureReason,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({
      status,
      providerReference: reference,
      message: "Selfie submitted for review.",
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
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

  return "manual_review";
}
