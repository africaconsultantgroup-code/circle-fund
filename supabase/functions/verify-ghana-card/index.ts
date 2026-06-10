import { getAuthedServiceClient, hashSensitiveValue, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;

  const { ghanaCardNumber } = await req.json();
  if (typeof ghanaCardNumber !== "string" || ghanaCardNumber.trim().length < 8) {
    return json({ error: "A valid Ghana Card number is required." }, 400);
  }

  const reference = providerReference("nia_card");
  const ghanaCardNumberHash = await hashSensitiveValue(ghanaCardNumber);
  const status = "manual_review";
  const failureReason = "Official verification provider call is disabled until credentials and contract are confirmed.";

  const { error: upsertError } = await serviceClient
    .from("user_verifications")
    .upsert({
      user_id: user.id,
      ghana_card_number_hash: ghanaCardNumberHash,
      ghana_card_verified: false,
      verification_provider: "official_nia",
      provider_reference: reference,
      verification_status: status,
      failure_reason: failureReason,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertError) return json({ error: upsertError.message }, 500);
  return json({ status, providerReference: reference, message: "Ghana Card verification request recorded for secure provider processing." }, 202);
});
