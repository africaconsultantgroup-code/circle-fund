import { corsHeaders, getAuthedServiceClient, isOptions, json, providerReference } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const expectedSecret = Deno.env.get("ADMIN_VERIFICATION_TEST_SECRET") ?? "";
    const providedSecret = req.headers.get("x-admin-verification-secret") ?? "";
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ error: "Unauthorized." }, 401);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { data: adminProfile, error: adminProfileError } = await serviceClient
      .from("profiles")
      .select("role, account_status")
      .eq("user_id", user.id)
      .single();

    if (adminProfileError || adminProfile?.role !== "admin" || adminProfile.account_status !== "active") {
      return json({ error: "Admin access required." }, 403);
    }

    const body = await req.json();
    const { userId } = body;
    if (typeof userId !== "string" || userId.trim().length < 10) {
      return json({ error: "A valid userId is required." }, 400);
    }

    const now = new Date().toISOString();
    const reference = providerReference("admin_test_verify");

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({
        profile_completed: true,
        account_status: "active",
        updated_at: now,
      })
      .eq("user_id", userId);

    if (profileError) return json({ error: profileError.message }, 500);

    const { error: verificationError } = await serviceClient
      .from("user_verifications")
      .upsert({
        user_id: userId,
        phone_verified: true,
        ghana_card_verified: true,
        face_verified: true,
        selfie_uploaded: true,
        verification_provider: "admin_test_override",
        provider_reference: reference,
        verification_status: "verified",
        failure_reason: null,
        verified_at: now,
        updated_at: now,
      }, { onConflict: "user_id" });

    if (verificationError) return json({ error: verificationError.message }, 500);

    return json({ status: "verified", providerReference: reference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});
