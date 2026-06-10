import { getAuthedServiceClient, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { phoneNumber } = await req.json();
    if (typeof phoneNumber !== "string" || phoneNumber.trim().length < 8) {
      return json({ error: "A valid phone number is required." }, 400);
    }

    const now = new Date().toISOString();
    const reference = providerReference("phone_otp");
    const status = "pending";
    const testOtp = Deno.env.get("PHONE_TEST_OTP") ?? "123456";
    const failureReason = "SMS provider is not connected. Test OTP issued by Edge Function.";

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({ phone: phoneNumber.trim(), updated_at: now })
      .eq("user_id", user.id);

    if (profileError) return json({ error: profileError.message }, 500);

    const { error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        phone_verified: false,
        verification_provider: "test_phone_otp",
        provider_reference: reference,
        verification_status: status,
        failure_reason: failureReason,
        updated_at: now,
      }, { onConflict: "user_id" });

    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({
      status,
      providerReference: reference,
      testOtp,
      message: `Test OTP sent. Use ${testOtp} to verify your phone.`,
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});
