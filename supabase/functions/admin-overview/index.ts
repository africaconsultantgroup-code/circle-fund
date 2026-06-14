import { corsHeaders, getAuthedServiceClient, isOptions, json } from "../_shared/verification.ts";

const staffRoles = ["super_admin", "operations", "compliance", "finance", "support", "admin"];

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;

  const { data: authUserResult, error: authUserError } = await serviceClient.auth.admin.getUserById(user.id);
  const authEmail = authUserError ? user.email ?? null : authUserResult.user?.email ?? user.email ?? null;
  const { profile: adminProfile, error: adminProfileError, bootstrapped } = await resolveAdminProfile(serviceClient, user.id, authEmail);

  console.log("admin_overview_authorization", {
    authUserId: user.id,
    email: authEmail,
    resolvedRole: adminProfile?.role ?? null,
    accountStatus: adminProfile?.account_status ?? null,
    profileFound: Boolean(adminProfile),
    profileError: adminProfileError?.message ?? null,
    allowed: isStaffRole(adminProfile?.role) && adminProfile?.account_status === "active",
    bootstrapped,
    checkedTable: "public.profiles",
    checkedField: "role",
    checkedFilter: "user_id = auth.uid()",
  });

  if (adminProfileError || !isStaffRole(adminProfile?.role) || adminProfile.account_status !== "active") {
    return json({
      error: "Admin access required.",
      authUserId: user.id,
      email: authEmail,
      resolvedRole: adminProfile?.role ?? null,
      accountStatus: adminProfile?.account_status ?? null,
    }, 403);
  }

  const [profilesResult, verificationsResult, circlesResult, membersResult, auditLogsResult, staffInvitationsResult, authUsers] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("user_id, full_name, phone, country, preferred_currency, account_status, profile_completed, role, created_at")
      .order("created_at", { ascending: false }),
    serviceClient
      .from("user_verifications")
      .select("user_id, phone_verified, ghana_card_verified, ghana_card_status, face_verified, face_status, selfie_uploaded, verification_status, provider_reference, verified_at, updated_at")
      .order("updated_at", { ascending: false }),
    serviceClient
      .from("circles")
      .select("id, owner_id, name, contribution_amount, base_currency, frequency, max_members, status, invite_code, invite_token, start_date, created_at")
      .order("created_at", { ascending: false }),
    serviceClient
      .from("circle_members")
      .select("id, circle_id, user_id, role, status, joined_at, approved_at, approved_by")
      .order("joined_at", { ascending: false }),
    serviceClient
      .from("audit_logs")
      .select("id, staff_user_id, action, target_type, target_id, notes, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    serviceClient
      .from("staff_invitations")
      .select("id, email, role, status, invited_by, accepted_user_id, invited_at, accepted_at, cancelled_at, metadata")
      .order("invited_at", { ascending: false }),
    serviceClient.auth.admin.listUsers(),
  ]);

  if (profilesResult.error) return json({ error: profilesResult.error.message }, 500);
  if (verificationsResult.error) return json({ error: verificationsResult.error.message }, 500);
  if (circlesResult.error) return json({ error: circlesResult.error.message }, 500);
  if (membersResult.error) return json({ error: membersResult.error.message }, 500);
  if (auditLogsResult.error) return json({ error: auditLogsResult.error.message }, 500);
  if (staffInvitationsResult.error) return json({ error: staffInvitationsResult.error.message }, 500);
  if (authUsers.error) return json({ error: authUsers.error.message }, 500);

  const profiles = profilesResult.data ?? [];
  const verifications = verificationsResult.data ?? [];
  const circles = circlesResult.data ?? [];
  const members = membersResult.data ?? [];
  const auditLogs = auditLogsResult.data ?? [];
  const staffInvitations = staffInvitationsResult.data ?? [];
  const authByUser = new Map(authUsers.data.users.map((authUser) => [authUser.id, authUser]));
  const verificationByUser = new Map(verifications.map((verification) => [verification.user_id, verification]));
  const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const membersByCircle = new Map<string, typeof members>();

  for (const member of members) {
    const existing = membersByCircle.get(member.circle_id) ?? [];
    existing.push(member);
    membersByCircle.set(member.circle_id, existing);
  }

  const users = profiles.map((profile) => {
    const authUser = authByUser.get(profile.user_id);
    const verification = verificationByUser.get(profile.user_id) ?? null;
    return {
      userId: profile.user_id,
      email: authUser?.email ?? null,
      fullName: profile.full_name,
      phone: profile.phone,
      country: profile.country ?? null,
      preferredCurrency: profile.preferred_currency ?? null,
      role: profile.role,
      accountStatus: profile.account_status,
      profileCompleted: profile.profile_completed,
      createdAt: profile.created_at,
      verification,
    };
  });

  const circleSummaries = circles.map((circle) => {
    const circleMembers = membersByCircle.get(circle.id) ?? [];
    const ownerProfile = profileByUser.get(circle.owner_id);
    const ownerAuth = authByUser.get(circle.owner_id);
    return {
      id: circle.id,
      ownerId: circle.owner_id,
      ownerName: ownerProfile?.full_name ?? ownerAuth?.email ?? null,
      ownerEmail: ownerAuth?.email ?? null,
      name: circle.name,
      contributionAmount: circle.contribution_amount,
      baseCurrency: circle.base_currency,
      frequency: circle.frequency,
      maxMembers: circle.max_members,
      status: circle.status,
      inviteCode: circle.invite_code ?? circle.invite_token,
      startDate: circle.start_date,
      createdAt: circle.created_at,
      memberCount: circleMembers.filter((member) => member.status === "approved").length,
      pendingMemberCount: circleMembers.filter((member) => member.status === "pending").length,
      totalMemberRows: circleMembers.length,
    };
  });

  const metrics = {
    totalUsers: profiles.length,
    verifiedUsers: verifications.filter((verification) => verification.verification_status === "verified").length,
    pendingVerifications: verifications.filter((verification) => verification.verification_status !== "verified").length,
    suspendedUsers: profiles.filter((profile) => profile.account_status === "suspended" || profile.account_status === "disabled").length,
    totalCircles: circles.length,
    activeCircles: circles.filter((circle) => circle.status === "active").length,
  };

  return json({
    staffRole: normalizeStaffRole(adminProfile.role),
    metrics,
    users,
    verifications,
    circles: circleSummaries,
    circleMembers: members,
    auditLogs: auditLogs.map((log) => {
      const staffProfile = log.staff_user_id ? profileByUser.get(log.staff_user_id) : null;
      const staffAuth = log.staff_user_id ? authByUser.get(log.staff_user_id) : null;
      return {
        ...log,
        staffName: staffProfile?.full_name ?? staffAuth?.email ?? null,
        staffEmail: staffAuth?.email ?? null,
      };
    }),
    staffInvitations,
  });
});

async function resolveAdminProfile(serviceClient: any, userId: string, authEmail: string | null) {
  const firstRead = await readAdminProfile(serviceClient, userId);
  if (firstRead.error || isStaffRole(firstRead.profile?.role)) {
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
      role: "super_admin",
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

function isStaffRole(role: string | null | undefined) {
  return staffRoles.includes(role ?? "");
}

function normalizeStaffRole(role: string) {
  return role === "admin" ? "super_admin" : role;
}
