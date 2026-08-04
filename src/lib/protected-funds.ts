import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase-types";

export type ProtectedFund = Database["public"]["Tables"]["protected_fund_ledger"]["Row"];
export type ProtectedFundEvent = Database["public"]["Tables"]["protected_fund_events"]["Row"];
export type ProtectionReconciliationItem =
  Database["public"]["Tables"]["protection_reconciliation_queue"]["Row"];

export async function getCustomerProtectedFundSummary() {
  const result = await supabase.rpc("get_customer_protected_fund_summary");
  return { data: result.data?.[0] ?? null, error: result.error };
}

export async function getCircleProtectedFundSummary(circleId: string) {
  const result = await supabase.rpc("get_circle_protected_fund_summary", {
    check_circle_id: circleId,
  });
  return { data: result.data?.[0] ?? null, error: result.error };
}

export async function getPiggyProtectedFunds(piggyId: string) {
  return supabase
    .from("protected_fund_ledger")
    .select("*")
    .eq("piggy_id", piggyId)
    .order("protected_at", { ascending: false });
}

export async function getAdminProtectedFunds() {
  const [funds, queue, report] = await Promise.all([
    supabase
      .from("protected_fund_ledger")
      .select("*")
      .order("protected_at", { ascending: false })
      .limit(250),
    supabase
      .from("protection_reconciliation_queue")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(100),
    supabase.rpc("get_protection_reconciliation_report"),
  ]);
  return {
    funds: funds.data ?? [],
    queue: queue.data ?? [],
    report: report.data ?? [],
    error: funds.error?.message ?? queue.error?.message ?? report.error?.message ?? null,
  };
}

export function setProtectedFundFreeze(
  fundId: string,
  action: "freeze" | "unfreeze",
  reason: string,
) {
  return supabase.rpc("set_protected_fund_freeze", {
    check_fund_id: fundId,
    requested_action: action,
    reason,
  });
}
