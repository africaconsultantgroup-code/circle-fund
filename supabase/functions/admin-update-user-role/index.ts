import { corsHeaders, getAuthedServiceClient, isOptions, json } from "../_shared/verification.ts";

const assignableRoles = ["super_admin", "operations", "compliance", "finance", "support", "customer"];

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

    console.log("admin_update_user_role_authorization", {
      authUserId: user.id,
      resolvedRole: staffProfile?.role ?? null,
      accountStatus: staffProfile?.account_status ?? null,
      allowed: staffProfile?.role === "super_admin" && staffProfile?.account_status === "active",
      profileError: staffProfileError?.message ?? null,
      checkedTable: "public.profiles",
      checkedField: "role",
    });

    if (staffProfileError || staffProfile?.role !== "super_admin" || staffProfile.account_status !== "active") {
      return json({
        error: "Super admin access required.",
        resolvedRole: staffProfile?.role ?? null,
        accountStatus: staffProfile?.account_status ?? null,
      }, 403);
    }

    const body = await req.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";

    if (userId.length < 10) {
      return json({ error: "A valid userId is required." }, 400);
    }

    if (!assignableRoles.includes(role)) {
      return json({ error: "A valid role is required." }, 400);
    }

    const { data: existingProfile, error: existingProfileError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfileError) return json({ error: existingProfileError.message }, 500);
    if (!existingProfile) return json({ error: "User profile not found." }, 404);

    const now = new Date().toISOString();
    const { data: updatedProfile, error: updateError } = await serviceClient
      .from("profiles")
      .update({ role, updated_at: now })
      .eq("user_id", userId)
      .select("user_id, role")
      .maybeSingle();

    if (updateError) return json({ error: updateError.message }, 500);
    if (!updatedProfile) return json({ error: "User role was not updated." }, 500);

    const { error: auditError } = await serviceClient
      .from("audit_logs")
      .insert({
        staff_user_id: user.id,
        action: "assign_user_role",
        target_type: "profile",
        target_id: userId,
        notes: "Super admin changed a user's admin/customer role.",
        metadata: {
          old_role: existingProfile.role,
          new_role: role,
          staff_role: staffProfile.role,
          source: "admin-update-user-role",
        },
      });

    if (auditError) {
      console.warn("admin_update_user_role_audit_log_failed", {
        staffUserId: user.id,
        targetUserId: userId,
        error: auditError.message,
      });
    }

    return json({ userId: updatedProfile.user_id, role: updatedProfile.role, staffRole: staffProfile.role, status: "updated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return json({ error: message }, 500);
  }
});
