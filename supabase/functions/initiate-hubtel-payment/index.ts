import { getAuthedServiceClient, corsHeaders, isOptions, json } from "../_shared/verification.ts";

type PaymentType = "contribution" | "savings" | "piggy_bag" | "personal_susu";

type PaymentRequest = {
  paymentType?: PaymentType;
  contributionId?: string | null;
  circleId?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PaymentConfig = {
  clientId: string;
  clientSecret: string;
  merchantAccount: string;
  callbackUrl: string;
  returnUrl: string;
  env: string;
  initiateUrl: string;
};

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    const { user, serviceClient, error } = await getAuthedServiceClient(req);
    if (error) return error;
    if (!user || !serviceClient) {
      return json({ ok: false, error: "Authentication required." }, 401);
    }

    const config = paymentConfig();
    const missingConfig = Object.entries(config)
      .filter(([key, value]) => key !== "env" && !value)
      .map(([key]) => key);
    if (missingConfig.length > 0) {
      console.error("hubtel_payment_config_missing", { missingConfig });
      return json({
        ok: false,
        error: "Hubtel payment configuration is missing.",
        missingConfig,
      }, 500);
    }

    const body = await req.json().catch(() => ({})) as PaymentRequest;
    const resolved = await resolvePaymentRequest(serviceClient, user.id, body);
    if ("error" in resolved) return resolved.error;

    const providerReference = `hubtel-${crypto.randomUUID()}`;
    const transactionPayload = {
      user_id: user.id,
      circle_id: resolved.circleId,
      contribution_id: resolved.contributionId,
      amount: resolved.amount,
      currency: resolved.currency,
      payment_method: "mobile_money",
      provider: "hubtel",
      provider_reference: providerReference,
      status: "initiated",
      payment_type: resolved.paymentType,
      provider_response: {
        mode: config.env,
        source: "hubtel_collection_edge_function",
        money_movement_allowed: true,
        ...(body.metadata ?? {}),
      },
    };

    const { data: transaction, error: transactionError } = await serviceClient
      .from("payment_transactions")
      .insert(transactionPayload)
      .select("*")
      .single();

    if (transactionError || !transaction) {
      console.error("hubtel_payment_transaction_insert_failed", {
        userId: user.id,
        error: transactionError?.message ?? null,
      });
      return json({ ok: false, error: transactionError?.message ?? "Unable to create payment transaction." }, 500);
    }

    if (resolved.contributionId) {
      await serviceClient.from("contribution_payments").insert({
        contribution_id: resolved.contributionId,
        payment_transaction_id: transaction.id,
        user_id: user.id,
        circle_id: resolved.circleId,
        amount: resolved.amount,
        status: "initiated",
      });

      await serviceClient
        .from("contributions")
        .update({
          payment_reference: providerReference,
          updated_at: new Date().toISOString(),
        })
        .eq("id", resolved.contributionId);
    }

    await insertAuditLog(serviceClient, user.id, "payment_initiated", transaction.id, {
      payment_type: resolved.paymentType,
      circle_id: resolved.circleId,
      contribution_id: resolved.contributionId,
      amount: resolved.amount,
      currency: resolved.currency,
      provider_reference: providerReference,
      mode: config.env,
    });

    const hubtelResult = await initiateHubtelCheckout(config, {
      amount: resolved.amount,
      currency: resolved.currency,
      description: resolved.description,
      clientReference: providerReference,
      callbackUrl: config.callbackUrl,
      returnUrl: appendPaymentReference(config.returnUrl, providerReference),
      cancellationUrl: appendPaymentReference(config.returnUrl, providerReference),
    });

    const checkoutUrl = extractCheckoutUrl(hubtelResult.responseBody);
    const nextStatus = hubtelResult.ok ? "pending" : "failed";
    const providerResponse = {
      ...transaction.provider_response,
      hubtel_status: hubtelResult.status,
      hubtel_response: hubtelResult.responseBody,
      checkout_url: checkoutUrl,
      callback_url: config.callbackUrl,
      return_url: appendPaymentReference(config.returnUrl, providerReference),
      payment_env: config.env,
      real_collection_enabled: true,
    };

    const { data: updatedTransaction, error: updateError } = await serviceClient
      .from("payment_transactions")
      .update({
        status: nextStatus,
        provider_response: providerResponse,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.id)
      .select("*")
      .single();

    if (updateError || !updatedTransaction) {
      console.error("hubtel_payment_transaction_update_failed", {
        transactionId: transaction.id,
        error: updateError?.message ?? null,
      });
      return json({ ok: false, error: updateError?.message ?? "Unable to update payment transaction." }, 500);
    }

    if (!hubtelResult.ok) {
      await insertAuditLog(serviceClient, user.id, "payment_failed", transaction.id, {
        provider_reference: providerReference,
        hubtel_status: hubtelResult.status,
        hubtel_response: hubtelResult.responseBody,
      });
      return json({
        ok: false,
        error: hubtelResult.error ?? "Hubtel payment initiation failed.",
        transaction: updatedTransaction,
        hubtelResponse: hubtelResult.responseBody,
      }, hubtelResult.status >= 400 && hubtelResult.status < 600 ? hubtelResult.status : 502);
    }

    return json({
      ok: true,
      transaction: updatedTransaction,
      checkoutUrl,
      providerReference,
      message: checkoutUrl ? "Hubtel checkout created." : "Hubtel payment request created.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Hubtel payment error.";
    console.error("hubtel_payment_unhandled_error", { message });
    return json({ ok: false, error: message }, 500);
  }
});

async function resolvePaymentRequest(serviceClient: any, userId: string, body: PaymentRequest) {
  const paymentType = body.paymentType ?? (body.contributionId ? "contribution" : null);
  if (!paymentType || !["contribution", "savings", "piggy_bag", "personal_susu"].includes(paymentType)) {
    return { error: json({ ok: false, error: "Unsupported payment type." }, 400) };
  }

  if (body.contributionId) {
    const { data: contribution, error: contributionError } = await serviceClient
      .from("contributions")
      .select("*, circles(id, name, base_currency)")
      .eq("id", body.contributionId)
      .single();

    if (contributionError || !contribution) {
      return { error: json({ ok: false, error: contributionError?.message ?? "Contribution not found." }, 404) };
    }

    if (contribution.user_id !== userId) {
      return { error: json({ ok: false, error: "You can only pay your own contribution." }, 403) };
    }

    if (["paid", "processed"].includes(String(contribution.status))) {
      return { error: json({ ok: false, error: "This contribution is already paid." }, 400) };
    }

    const amount = Number(contribution.amount_due ?? contribution.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: json({ ok: false, error: "Contribution amount must be greater than 0." }, 400) };
    }

    return {
      paymentType: "contribution" as PaymentType,
      contributionId: contribution.id as string,
      circleId: contribution.circle_id as string | null,
      amount,
      currency: contribution.circles?.base_currency ?? body.currency ?? "GHS",
      description: `${contribution.circles?.name ?? "SikaCircle"} contribution`,
    };
  }

  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: json({ ok: false, error: "Payment amount must be greater than 0." }, 400) };
  }

  return {
    paymentType: paymentType as PaymentType,
    contributionId: null,
    circleId: body.circleId ?? null,
    amount,
    currency: body.currency ?? "GHS",
    description: `SikaCircle ${paymentType.replace(/_/g, " ")} payment`,
  };
}

function paymentConfig(): PaymentConfig {
  return {
    clientId: Deno.env.get("HUBTEL_PAYMENT_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("HUBTEL_PAYMENT_CLIENT_SECRET") ?? "",
    merchantAccount: Deno.env.get("HUBTEL_PAYMENT_MERCHANT_ACCOUNT") ?? "",
    callbackUrl: Deno.env.get("HUBTEL_CALLBACK_URL") ?? "",
    returnUrl: Deno.env.get("HUBTEL_RETURN_URL") ?? "",
    env: Deno.env.get("HUBTEL_PAYMENT_ENV") ?? "sandbox",
    initiateUrl: Deno.env.get("HUBTEL_PAYMENT_INITIATE_URL") ?? "https://payproxyapi.hubtel.com/items/initiate",
  };
}

async function initiateHubtelCheckout(
  config: PaymentConfig,
  payload: {
    amount: number;
    currency: string;
    description: string;
    clientReference: string;
    callbackUrl: string;
    returnUrl: string;
    cancellationUrl: string;
  },
) {
  const auth = btoa(`${config.clientId}:${config.clientSecret}`);
  const hubtelPayload = {
    totalAmount: Number(payload.amount.toFixed(2)),
    description: payload.description,
    callbackUrl: payload.callbackUrl,
    returnUrl: payload.returnUrl,
    cancellationUrl: payload.cancellationUrl,
    merchantAccountNumber: config.merchantAccount,
    clientReference: payload.clientReference,
  };

  console.log("hubtel_payment_checkout_request", {
    clientReference: payload.clientReference,
    amount: hubtelPayload.totalAmount,
    currency: payload.currency,
    merchantAccount: maskValue(config.merchantAccount),
    callbackUrl: payload.callbackUrl,
    returnUrl: payload.returnUrl,
    env: config.env,
  });

  const response = await fetch(config.initiateUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(hubtelPayload),
  });

  const responseText = await response.text();
  const responseBody = parseJson(responseText);

  console.log("hubtel_payment_checkout_response", {
    status: response.status,
    ok: response.ok,
    clientReference: payload.clientReference,
    checkoutUrlFound: Boolean(extractCheckoutUrl(responseBody)),
  });

  return {
    ok: response.ok,
    status: response.status,
    responseBody,
    error: response.ok ? null : extractHubtelError(responseBody, responseText),
  };
}

async function insertAuditLog(serviceClient: any, userId: string | null, action: string, targetId: string, metadata: Record<string, unknown>) {
  const { error } = await serviceClient.from("audit_logs").insert({
    staff_user_id: userId,
    action,
    target_type: "payment_transaction",
    target_id: targetId,
    notes: action === "payment_initiated" ? "Customer initiated real Hubtel collection payment." : "Hubtel collection payment update.",
    metadata,
  });

  if (error) {
    console.error("hubtel_payment_audit_insert_failed", { action, targetId, error: error.message });
  }
}

function parseJson(value: string) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value };
  }
}

function extractCheckoutUrl(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== "object") return null;
  const record = responseBody as Record<string, unknown>;
  const data = typeof record.data === "object" && record.data ? record.data as Record<string, unknown> : null;
  const candidates = [
    record.checkoutUrl,
    record.checkout_url,
    record.paymentUrl,
    record.payment_url,
    record.url,
    data?.checkoutUrl,
    data?.checkout_url,
    data?.paymentUrl,
    data?.payment_url,
    data?.url,
  ];

  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.startsWith("http")) ?? null;
}

function extractHubtelError(responseBody: unknown, fallback: string) {
  if (responseBody && typeof responseBody === "object") {
    const record = responseBody as Record<string, unknown>;
    for (const key of ["message", "Message", "error", "Error", "detail", "Detail"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }

  return fallback || "Hubtel rejected the payment request.";
}

function appendPaymentReference(url: string, reference: string) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}provider_reference=${encodeURIComponent(reference)}`;
}

function maskValue(value: string) {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
