import { getAuthedServiceClient, isOptions, json, providerReference, corsHeaders } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { phoneNumber, otp } = await req.json();
    if (typeof phoneNumber !== "string" || typeof otp !== "string" || otp.trim().length < 4) {
      return json({ error: "A phone number and OTP are required." }, 400);
    }

    const expectedOtp = Deno.env.get("PHONE_TEST_OTP") ?? "123456";
    if (otp.trim() !== expectedOtp) {
      return json({ error: "Invalid OTP. Use the test OTP returned by the phone request." }, 403);
    }

    const now = new Date().toISOString();
    const reference = providerReference("phone_verify");
    const status = "verified";

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({ phone: phoneNumber.trim(), phone_otp_verification_status: "verified", updated_at: now })
      .eq("user_id", user.id);

    if (profileError) return json({ error: profileError.message }, 500);

    const { error: upsertError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: user.id,
        phone_verified: true,
        verification_provider: "test_phone_otp",
        provider_reference: reference,
        verification_status: status,
        failure_reason: null,
        updated_at: now,
      }, { onConflict: "user_id" });

    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({
      status,
      providerReference: reference,
      message: "Phone number verified with test OTP.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});
