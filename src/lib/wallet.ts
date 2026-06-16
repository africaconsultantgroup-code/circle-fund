import { supabase } from "./supabase";
import type { Database, Json } from "./supabase-types";

export type WalletAccount = Database["public"]["Tables"]["wallet_accounts"]["Row"];
export type WalletTransaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
export type WalletSummary = Database["public"]["Functions"]["get_wallet_summary"]["Returns"][number];

export type WalletTransactionWithCircle = WalletTransaction & {
  circles?: { name: string | null } | null;
};

export async function getWalletSummary() {
  const result = await supabase.rpc("get_wallet_summary");
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  };
}

export async function listWalletTransactions(limit = 30) {
  return supabase
    .from("wallet_transactions")
    .select("*, circles(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function payContributionFromWallet(contributionId: string) {
  return supabase.rpc("pay_contribution_from_wallet", {
    check_contribution_id: contributionId,
  });
}

export async function receivePayoutToWallet(scheduleId: string) {
  return supabase.rpc("receive_payout_to_wallet", {
    check_schedule_id: scheduleId,
  });
}

export function walletTransactionLabel(type: WalletTransaction["transaction_type"]) {
  const labels: Record<WalletTransaction["transaction_type"], string> = {
    deposit: "Deposit",
    contribution_payment: "Contribution payment",
    payout_received: "Payout received",
    piggy_bag_deposit: "Piggy Box deposit",
    piggy_bag_withdrawal: "Piggy Box withdrawal",
    savings_deposit: "Savings deposit",
    refund: "Refund",
  };

  return labels[type] ?? "Wallet movement";
}

export function walletPaymentMethodLabel(method: string | null | undefined) {
  const labels: Record<string, string> = {
    mtn_momo: "MTN MoMo",
    telecel_cash: "Telecel Cash",
    airteltigo_money: "AirtelTigo Money",
    sika_wallet: "Sika Wallet",
  };

  return method ? labels[method] ?? method.replace(/_/g, " ") : "Sika Wallet";
}

export function walletMetadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}
