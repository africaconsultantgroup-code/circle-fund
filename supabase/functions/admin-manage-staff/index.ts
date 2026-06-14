import { corsHeaders, getAuthedServiceClient, isOptions, json } from "../_shared/verification.ts";

const staffInviteRoles = ["super_admin", "operations", "compliance", "finance", "support"];

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;

    const { data: staffProfile, error: staffProfileError } = await serviceClient
      .from("profiles")
      .select("role, account_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (staffProfileError || staffProfile?.role !== "super_admin" || staffProfile.account_status !== "active") {
      return json({
        error: "Super admin access required.",
        resolvedRole: staffProfile?.role ?? null,
        accountStatus: staffProfile?.account_status ?? null,
      }, 403);
    }

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "invite") {
      return inviteStaff({ body, userId: user.id, serviceClient });
    }

    if (action === "cancel_invitation") {
      return cancelInvitation({ body, userId: user.id, serviceClient });
    }

    if (action === "disable_staff") {
      return disableStaff({ body, userId: user.id, serviceClient });
    }

    return json({ error: "Unsupported staff management action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});

async function inviteStaff({ body, userId, serviceClient }: { body: Record<string, unknown>; userId: string; serviceClient: any }) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";

  if (!email || !email.includes("@")) {
    return json({ error: "A valid staff email is required." }, 400);
  }

  if (!staffInviteRoles.includes(role)) {
    return json({ error: "A valid staff role is required." }, 400);
  }

  const { data: existingInvitation, error: existingInvitationError } = await serviceClient
    .from("staff_invitations")
    .select("*")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvitationError) return json({ error: existingInvitationError.message }, 500);

  const invitationWrite = existingInvitation
    ? serviceClient
      .from("staff_invitations")
      .update({
        role,
        invited_by: userId,
        invited_at: new Date().toISOString(),
        metadata: { source: "admin-manage-staff", updated_existing_pending_invitation: true },
      })
      .eq("id", existingInvitation.id)
      .select("*")
      .maybeSingle()
    : serviceClient
    .from("staff_invitations")
    .insert({
      email,
      role,
      status: "pending",
      invited_by: userId,
      invited_at: new Date().toISOString(),
      metadata: { source: "admin-manage-staff" },
    })
    .select("*")
    .maybeSingle();

  const { data: invitation, error: inviteError } = await invitationWrite;

  if (inviteError) return json({ error: inviteError.message }, 500);
  if (!invitation) return json({ error: "Staff invitation was not created." }, 500);

  const existingAuthUser = await findAuthUserByEmail(serviceClient, email);
  if (existingAuthUser?.id) {
    const now = new Date().toISOString();
    await serviceClient
      .from("profiles")
      .upsert({
        user_id: existingAuthUser.id,
        role,
        account_status: "active",
        profile_completed: true,
        updated_at: now,
      }, { onConflict: "user_id" });

    await serviceClient
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_user_id: existingAuthUser.id,
        accepted_at: now,
        metadata: { source: "admin-manage-staff", accepted_from: "existing_auth_user" },
      })
      .eq("id", invitation.id);
  }

  await writeAudit(serviceClient, {
    staffUserId: userId,
    action: "invite_staff",
    targetType: "staff_invitation",
    targetId: invitation.id,
    notes: "Super admin invited a staff user.",
    metadata: { email, role, existing_user_matched: Boolean(existingAuthUser?.id) },
  });

  return json({ invitation, status: "invited", matchedExistingUser: Boolean(existingAuthUser?.id) });
}

async function cancelInvitation({ body, userId, serviceClient }: { body: Record<string, unknown>; userId: string; serviceClient: any }) {
  const invitationId = typeof body.invitationId === "string" ? body.invitationId.trim() : "";
  if (invitationId.length < 10) return json({ error: "A valid invitationId is required." }, 400);

  const { data: invitation, error } = await serviceClient
    .from("staff_invitations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!invitation) return json({ error: "Pending invitation not found." }, 404);

  await writeAudit(serviceClient, {
    staffUserId: userId,
    action: "cancel_staff_invitation",
    targetType: "staff_invitation",
    targetId: invitation.id,
    notes: "Super admin cancelled a staff invitation.",
    metadata: { email: invitation.email, role: invitation.role },
  });

  return json({ invitation, status: "cancelled" });
}

async function disableStaff({ body, userId, serviceClient }: { body: Record<string, unknown>; userId: string; serviceClient: any }) {
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (targetUserId.length < 10) return json({ error: "A valid userId is required." }, 400);
  if (targetUserId === userId) return json({ error: "You cannot disable your own staff account." }, 400);

  const { data: profile, error } = await serviceClient
    .from("profiles")
    .update({ account_status: "disabled", updated_at: new Date().toISOString() })
    .eq("user_id", targetUserId)
    .neq("role", "customer")
    .select("user_id, role, account_status")
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!profile) return json({ error: "Staff profile not found." }, 404);

  await writeAudit(serviceClient, {
    staffUserId: userId,
    action: "disable_staff_account",
    targetType: "profile",
    targetId: targetUserId,
    notes: "Super admin disabled a staff account.",
    metadata: { role: profile.role },
  });

  return json({ profile, status: "disabled" });
}

async function findAuthUserByEmail(serviceClient: any, email: string) {
  const { data, error } = await serviceClient.auth.admin.listUsers();
  if (error) return null;
  return data.users.find((authUser: { id: string; email?: string | null }) => authUser.email?.toLowerCase() === email) ?? null;
}

async function writeAudit(serviceClient: any, payload: {
  staffUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  notes: string;
  metadata: Record<string, unknown>;
}) {
  const { error } = await serviceClient
    .from("audit_logs")
    .insert({
      staff_user_id: payload.staffUserId,
      action: payload.action,
      target_type: payload.targetType,
      target_id: payload.targetId,
      notes: payload.notes,
      metadata: { ...payload.metadata, staff_role: "super_admin", source: "admin-manage-staff" },
    });

  if (error) {
    console.warn("admin_manage_staff_audit_log_failed", { action: payload.action, error: error.message });
  }
}
