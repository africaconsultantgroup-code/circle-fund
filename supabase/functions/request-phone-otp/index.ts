import { getAuthedServiceClient, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;

  const { phoneNumber } = await req.json();
  if (typeof phoneNumber !== "string" || phoneNumber.trim().length < 8) {
    return json({ error: "A valid phone number is required." }, 400);
  }

  const reference = providerReference("phone_otp");
  const status = "manual_review";
  const failureReason = "Official phone OTP provider call is disabled until credentials and contract are confirmed.";

  const { error: profileError } = await serviceClient
    .from("profiles")
    .update({ phone: phoneNumber.trim(), updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (profileError) return json({ error: profileError.message }, 500);

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
  return json({ status, providerReference: reference, message: "Phone OTP request recorded for secure provider processing." }, 202);
});
