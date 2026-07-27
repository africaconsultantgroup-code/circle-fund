import { getAuthedServiceClient, corsHeaders, isOptions, json } from "../_shared/verification.ts";
import { payoutProvider } from "../_shared/payout-provider.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;
  if (!user || !serviceClient) {
    return json({ ok: false, error: "Authentication required." }, 401);
  }

  const { data: staff } = await serviceClient
    .from("profiles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .single();
  if (
    !staff ||
    staff.account_status !== "active" ||
    !["super_admin", "finance"].includes(staff.role)
  ) {
    return json({ ok: false, error: "Finance access required." }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as { releaseId?: string };
  if (!body.releaseId) return json({ ok: false, error: "releaseId is required." }, 400);

  const [{ data: settings }, { data: release, error: releaseError }] = await Promise.all([
    serviceClient.from("payout_execution_settings").select("execution_mode").single(),
    serviceClient.from("fund_releases").select("*").eq("id", body.releaseId).single(),
  ]);

  if (releaseError || !release) {
    return json({ ok: false, error: releaseError?.message ?? "Release not found." }, 404);
  }
  if (release.status !== "release_pending") {
    return json({ ok: false, error: "Release is not pending provider execution." }, 409);
  }
  if (release.execution_blocked || release.is_test_record) {
    return json({ ok: false, error: "This release is blocked from provider execution." }, 409);
  }
  if (settings?.execution_mode !== "live") {
    await serviceClient.from("audit_logs").insert({
      staff_user_id: user.id,
      action: "provider_request_blocked",
      target_type: "fund_release",
      target_id: release.id,
      notes: "Payout execution mode is not live. No provider request was sent.",
      metadata: { execution_mode: settings?.execution_mode ?? "preview" },
    });
    return json(
      {
        ok: false,
        code: "payout_execution_preview_only",
        executionMode: settings?.execution_mode ?? "preview",
        message: "No money moved. Payout execution is not live.",
      },
      409,
    );
  }

  const result = await payoutProvider().initiateDisbursement({
    releaseId: release.id,
    releaseReference: release.release_reference,
    beneficiaryUserId: release.beneficiary_user_id,
    amount: Number(release.amount),
    currency: release.currency,
    destinationType: "mobile_money",
    destinationReference: release.payment_destination_reference,
  });

  return json(
    {
      ...result,
      message: result.ok
        ? "Provider accepted the payout request; this is not payout confirmation."
        : result.message,
    },
    result.ok ? 202 : 409,
  );
});
