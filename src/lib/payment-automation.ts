import { supabase } from "@/lib/supabase";
import type {
  AutomationFrequency,
  AutomationPaymentMethod,
  AutomationType,
  Database,
} from "@/lib/supabase-types";

export type PaymentAutomation = Database["public"]["Tables"]["payment_automations"]["Row"];
export type ScheduledPayment = Database["public"]["Tables"]["scheduled_payments"]["Row"];

export type AutomationDashboardData = {
  automations: PaymentAutomation[];
  scheduledPayments: ScheduledPayment[];
  names: Record<string, string>;
};

export async function loadAutomationDashboard(): Promise<{
  data: AutomationDashboardData;
  error: string | null;
}> {
  const [automationResult, scheduledResult] = await Promise.all([
    supabase.from("payment_automations").select("*").order("created_at", { ascending: false }),
    supabase.from("scheduled_payments").select("*").order("due_date", { ascending: true }),
  ]);

  const error = automationResult.error?.message ?? scheduledResult.error?.message ?? null;
  const automations = automationResult.data ?? [];
  const scheduledPayments = scheduledResult.data ?? [];
  const circleIds = automations.flatMap((item) => (item.circle_id ? [item.circle_id] : []));
  const piggyIds = automations.flatMap((item) => (item.piggy_id ? [item.piggy_id] : []));
  const [circleResult, piggyResult] = await Promise.all([
    circleIds.length
      ? supabase.from("circles").select("id,name").in("id", circleIds)
      : Promise.resolve({ data: [], error: null }),
    piggyIds.length
      ? supabase.from("personal_susu_plans").select("id,name").in("id", piggyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const names = Object.fromEntries([
    ...(circleResult.data ?? []).map((item) => [item.id, item.name] as const),
    ...(piggyResult.data ?? []).map((item) => [item.id, item.name] as const),
  ]);

  return { data: { automations, scheduledPayments, names }, error };
}

export async function enablePaymentAutomation(payload: {
  automationType: AutomationType;
  circleId?: string | null;
  piggyId?: string | null;
  amount?: number | null;
  frequency?: AutomationFrequency | null;
  paymentMethod: AutomationPaymentMethod;
  phoneNumber?: string | null;
  startDate: string;
}) {
  return supabase.rpc("enable_payment_automation", {
    requested_type: payload.automationType,
    requested_circle_id: payload.circleId ?? null,
    requested_piggy_id: payload.piggyId ?? null,
    requested_amount: payload.amount ?? null,
    requested_frequency: payload.frequency ?? null,
    requested_payment_method: payload.paymentMethod,
    requested_phone_number: payload.phoneNumber ?? null,
    requested_start_date: payload.startDate,
    requested_max_retries: 2,
  });
}

export async function setPaymentAutomationStatus(
  automationId: string,
  action: "pause" | "resume" | "cancel",
) {
  return supabase.rpc("set_payment_automation_status", {
    check_automation_id: automationId,
    requested_action: action,
  });
}

export async function initiateScheduledPayment(scheduledPaymentId: string) {
  return supabase.functions.invoke<{
    ok: boolean;
    code?: string;
    status: string;
    requiresAuthorization?: boolean;
    message?: string;
  }>("initiate-scheduled-payment", {
    body: { scheduledPaymentId },
  });
}

export async function loadAdminAutomations() {
  const [automations, payments, summary] = await Promise.all([
    supabase.from("payment_automations").select("*").order("created_at", { ascending: false }),
    supabase
      .from("scheduled_payments")
      .select("*")
      .order("due_date", { ascending: false })
      .limit(200),
    supabase.rpc("get_automation_admin_summary"),
  ]);
  return {
    automations: automations.data ?? [],
    payments: payments.data ?? [],
    summary: summary.data ?? [],
    error: automations.error?.message ?? payments.error?.message ?? summary.error?.message ?? null,
  };
}

export function automationTargetName(automation: PaymentAutomation, names: Record<string, string>) {
  const targetId = automation.circle_id ?? automation.piggy_id;
  return targetId
    ? (names[targetId] ?? (automation.circle_id ? "Circle" : "Piggy Bag"))
    : "Automation";
}
