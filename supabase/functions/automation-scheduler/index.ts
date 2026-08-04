import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const expectedSecret = Deno.env.get("AUTOMATION_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-automation-cron-secret");
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration is incomplete" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const [generated, prepared, reminders, matured] = await Promise.all([
    supabase.rpc("generate_scheduled_payments", { as_of_date: today }),
    supabase.rpc("prepare_due_scheduled_payments", { as_of_time: now }),
    supabase.rpc("generate_payment_reminders", { as_of_time: now }),
    supabase.rpc("advance_protected_fund_maturity", { as_of_date: today }),
  ]);
  const error = generated.error ?? prepared.error ?? reminders.error ?? matured.error;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      scheduledPaymentsCreated: generated.data,
      paymentsMadeDue: prepared.data,
      remindersCreated: reminders.data,
      protectedFundsMatured: matured.data,
      providerAttempted: false,
    }),
    { headers: jsonHeaders },
  );
});
