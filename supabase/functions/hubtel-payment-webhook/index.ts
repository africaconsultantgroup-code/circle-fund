import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isOptions, json } from "../_shared/verification.ts";

Deno.serve(async (req) => {
  if (isOptions(req)) return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "Webhook service configuration is missing." }, 500);
    }

    const payload = await req.json().catch(() => ({}));
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
      mode: "placeholder",
      message: "Hubtel webhook placeholder received. Validation will be enabled before real collections.",
      event: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected webhook error.";
    return json({ ok: false, error: message }, 500);
  }
});
