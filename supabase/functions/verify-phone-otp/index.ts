import { getAuthedServiceClient, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;

  const { phoneNumber, otp } = await req.json();
  if (typeof phoneNumber !== "string" || typeof otp !== "string" || otp.trim().length < 4) {
    return json({ error: "A phone number and OTP are required." }, 400);
  }

  const reference = providerReference("phone_verify");
  const status = "manual_review";
  const failureReason = "Official phone OTP provider call is disabled until credentials and contract are confirmed.";

  const { error: upsertError } = await serviceClient
    .from("user_verifications")
    .upsert({
      user_id: user.id,
      phone_verified: false,
      verification_provider: "official_nia",
      provider_reference: reference,
      verification_status: status,
      failure_reason: failureReason,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (upsertError) return json({ error: upsertError.message }, 500);
  return json({ status, providerReference: reference, message: "Phone OTP verification request recorded for secure provider processing." }, 202);
});
