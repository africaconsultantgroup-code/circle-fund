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
    const status = "manual_review";
    const failureReason = "Live face verification provider is not connected. Submitted for admin review.";

    const { error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        selfie_uploaded: true,
        face_verified: false,
        verification_provider: "admin_review",
        provider_reference: reference,
        verification_status: status,
        failure_reason: failureReason,
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
