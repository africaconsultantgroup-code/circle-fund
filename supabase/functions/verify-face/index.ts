import { getAuthedServiceClient, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;

  const { selfieCaptureReference } = await req.json();
  if (typeof selfieCaptureReference !== "string" || selfieCaptureReference.trim().length < 6) {
    return json({ error: "A selfie capture reference is required. Raw selfie images should not be sent to this placeholder function." }, 400);
  }

  const reference = providerReference("nia_face");
  const status = "manual_review";
  const failureReason = "Official face verification provider call is disabled until credentials and contract are confirmed.";

  const { error: upsertError } = await serviceClient
    .from("user_verifications")
    .upsert({
      user_id: user.id,
      selfie_uploaded: true,
      face_verified: false,
      verification_provider: "official_nia",
      provider_reference: reference,
      verification_status: status,
      failure_reason: failureReason,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertError) return json({ error: upsertError.message }, 500);
  return json({ status, providerReference: reference, message: "Face verification request recorded for secure provider processing." }, 202);
});
