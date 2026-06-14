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

    const { data: authUserResult, error: authUserError } = await serviceClient.auth.admin.getUserById(user.id);
    const authEmail = authUserError ? user.email ?? null : authUserResult.user?.email ?? user.email ?? null;

    const { profile: adminProfile, error: adminProfileError, bootstrapped } = await resolveAdminProfile(serviceClient, user.id, authEmail);

    console.log("admin_mark_test_user_verified_authorization", {
      authUserId: user.id,
      email: authEmail,
      resolvedRole: adminProfile?.role ?? null,
      accountStatus: adminProfile?.account_status ?? null,
      profileFound: Boolean(adminProfile),
      profileError: adminProfileError?.message ?? null,
      allowed: adminProfile?.role === "admin" && adminProfile.account_status === "active",
      bootstrapped,
      expectedRole: "admin",
      checkedTable: "public.profiles",
      checkedField: "role",
      checkedFilter: "user_id = auth.uid()",
    });

    if (adminProfileError || adminProfile?.role !== "admin" || adminProfile.account_status !== "active") {
      return json({
        error: "Admin access required.",
        authUserId: user.id,
        email: authEmail,
        resolvedRole: adminProfile?.role ?? null,
        accountStatus: adminProfile?.account_status ?? null,
      }, 403);
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
        otp_status: "verified",
        otp_verified_at: now,
        ghana_card_verified: true,
        ghana_card_status: "verified",
        face_verified: true,
        face_status: "verified",
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

async function resolveAdminProfile(serviceClient: any, userId: string, authEmail: string | null) {
  const firstRead = await readAdminProfile(serviceClient, userId);
  if (firstRead.error || firstRead.profile?.role === "admin") {
    return { ...firstRead, bootstrapped: false };
  }

  if (!authEmail) {
    return { ...firstRead, bootstrapped: false };
  }

  const { data: bootstrapEmail, error: bootstrapEmailError } = await serviceClient
    .from("admin_bootstrap_emails")
    .select("email")
    .eq("email", authEmail.toLowerCase())
    .maybeSingle();

  if (bootstrapEmailError || !bootstrapEmail) {
    return { ...firstRead, bootstrapped: false };
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await serviceClient
    .from("profiles")
    .upsert({
      user_id: userId,
      role: "admin",
      account_status: "active",
      profile_completed: true,
      updated_at: now,
    }, { onConflict: "user_id" });

  if (upsertError) {
    return { profile: firstRead.profile, error: upsertError, bootstrapped: false };
  }

  const secondRead = await readAdminProfile(serviceClient, userId);
  return { ...secondRead, bootstrapped: true };
}

async function readAdminProfile(serviceClient: any, userId: string) {
  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("role, account_status")
    .eq("user_id", userId)
    .maybeSingle();

  return { profile, error };
}
