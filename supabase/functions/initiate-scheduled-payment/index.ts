import { getAuthedServiceClient, corsHeaders, isOptions, json } from "../_shared/verification.ts";
import { scheduledPaymentProvider } from "../_shared/payment-provider.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const { user, serviceClient, error } = await getAuthedServiceClient(req);
  if (error) return error;
  if (!user || !serviceClient) return json({ ok: false, error: "Authentication required." }, 401);

  const body = (await req.json().catch(() => ({}))) as { scheduledPaymentId?: string };
  if (!body.scheduledPaymentId)
    return json({ ok: false, error: "scheduledPaymentId is required." }, 400);

  const { data: scheduled, error: scheduledError } = await serviceClient
    .from("scheduled_payments")
    .select("*, payment_automations(*)")
    .eq("id", body.scheduledPaymentId)
    .eq("user_id", user.id)
    .single();

  if (scheduledError || !scheduled) {
    return json(
      { ok: false, error: scheduledError?.message ?? "Scheduled payment not found." },
      404,
    );
  }
  if (!["due", "failed", "retry_scheduled", "overdue"].includes(scheduled.status)) {
    return json({ ok: false, error: "This scheduled payment is not due." }, 409);
  }

  const automation = Array.isArray(scheduled.payment_automations)
    ? scheduled.payment_automations[0]
    : scheduled.payment_automations;
  if (!automation || automation.status !== "active") {
    return json({ ok: false, error: "This automation is not active." }, 409);
  }

  const result = await scheduledPaymentProvider().initiateScheduledPayment({
    scheduledPaymentId: scheduled.id,
    userId: user.id,
    amount: Number(scheduled.amount),
    currency: "GHS",
    paymentMethod: automation.payment_method,
    phoneNumber: automation.phone_number,
    authorizationReference: automation.authorization_reference,
  });

  if (!result.ok) {
    await serviceClient.from("audit_logs").insert({
      staff_user_id: user.id,
      action: "payment_attempted",
      target_type: "scheduled_payment",
      target_id: scheduled.id,
      notes: result.message,
      metadata: { result_code: result.code, automation_id: automation.id },
    });
    return json(
      {
        ok: false,
        code: result.code,
        status: "due",
        requiresAuthorization: true,
        message: result.message,
      },
      409,
    );
  }

  return json({ ok: true, status: result.status, providerReference: result.providerReference });
});
