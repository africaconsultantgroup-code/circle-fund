import { corsHeaders, getAuthedServiceClient, isOptions, json } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

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

  const { data: profiles, error: profilesError } = await serviceClient
    .from("profiles")
    .select("user_id, full_name, phone, account_status, profile_completed, role, created_at")
    .order("created_at", { ascending: false });

  if (profilesError) return json({ error: profilesError.message }, 500);

  const { data: verifications, error: verificationsError } = await serviceClient
    .from("user_verifications")
    .select("user_id, phone_verified, ghana_card_verified, ghana_card_status, face_verified, face_status, selfie_uploaded, verification_status, provider_reference, verified_at, updated_at");

  if (verificationsError) return json({ error: verificationsError.message }, 500);

  const authUsers = await serviceClient.auth.admin.listUsers();
  if (authUsers.error) return json({ error: authUsers.error.message }, 500);

  const verificationByUser = new Map((verifications ?? []).map((verification) => [verification.user_id, verification]));
  const authByUser = new Map(authUsers.data.users.map((authUser) => [authUser.id, authUser]));

  const users = (profiles ?? []).map((profile) => {
    const authUser = authByUser.get(profile.user_id);
    const verification = verificationByUser.get(profile.user_id) ?? null;
    return {
      userId: profile.user_id,
      email: authUser?.email ?? null,
      fullName: profile.full_name,
      phone: profile.phone,
      role: profile.role,
      accountStatus: profile.account_status,
      profileCompleted: profile.profile_completed,
      createdAt: profile.created_at,
      verification,
    };
  });

  return json({ users });
});
