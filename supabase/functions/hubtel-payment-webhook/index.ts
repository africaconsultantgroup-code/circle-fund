import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isOptions, json } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (!["GET", "POST"].includes(req.method)) {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "Webhook service configuration is missing." }, 500);
    }

    const payload = await readHubtelPayload(req);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await serviceClient.rpc("record_hubtel_payment_webhook", { payload });

    if (error) {
      console.error("hubtel_payment_webhook_record_failed", {
        error: error.message,
        payload,
      });
      return json({ ok: false, error: error.message }, 500);
    }

    console.log("hubtel_payment_webhook_received", {
      eventId: data?.id ?? null,
      providerReference: data?.provider_reference ?? null,
      processingStatus: data?.processing_status ?? null,
    });

    return json({
      ok: true,
      mode: "hubtel_collection",
      message: "Hubtel webhook received. Accounting is updated only after successful payment confirmation.",
      event: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected webhook error.";
    return json({ ok: false, error: message }, 500);
  }
});

async function readHubtelPayload(req: Request) {
  const url = new URL(req.url);
  const queryPayload = Object.fromEntries(url.searchParams.entries());

  if (req.method === "GET") {
    return queryPayload;
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return mergePayload(queryPayload, body);
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (form) {
      return mergePayload(queryPayload, Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)])));
    }
  }

  const text = await req.text().catch(() => "");
  if (!text) return queryPayload;

  try {
    return mergePayload(queryPayload, JSON.parse(text));
  } catch {
    return mergePayload(queryPayload, Object.fromEntries(new URLSearchParams(text).entries()));
  }
}

function mergePayload(queryPayload: Record<string, unknown>, bodyPayload: unknown) {
  if (!bodyPayload || typeof bodyPayload !== "object" || Array.isArray(bodyPayload)) {
    return queryPayload;
  }

  return {
    ...queryPayload,
    ...(bodyPayload as Record<string, unknown>),
  };
}
