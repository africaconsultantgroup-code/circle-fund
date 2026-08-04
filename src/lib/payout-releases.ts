import { supabase } from "@/lib/supabase";
import type { CurrencyCode } from "@/lib/supabase-types";

// Generated database types are updated after migration deployment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payoutDb = supabase as any;

export type PayoutPreview = {
  candidate_key: string;
  release_type: "circle_payout" | "piggy_maturity";
  circle_id: string | null;
  piggy_id: string | null;
  payout_schedule_id: string | null;
  beneficiary_user_id: string;
  amount: number;
  currency: CurrencyCode;
  maturity_date: string | null;
  protected_funds_available: number;
  frozen_amount: number;
  already_allocated: number;
  payment_destination_type: string | null;
  payment_destination_summary: string | null;
  eligibility: string;
  blocking_reason: string | null;
  is_test_record: boolean;
};

export type FundRelease = {
  id: string;
  release_reference: string;
  release_type: "circle_payout" | "piggy_maturity";
  circle_id: string | null;
  piggy_id: string | null;
  beneficiary_user_id: string;
  payout_schedule_id: string | null;
  amount: number;
  currency: CurrencyCode;
  status: string;
  payment_destination_type: string;
  provider: string;
  provider_reference: string | null;
  failure_reason: string | null;
  next_retry_at: string | null;
  released_at: string | null;
  is_test_record: boolean;
  execution_blocked: boolean;
  blocking_reason: string | null;
  created_at: string;
};

export async function loadPayoutPreview() {
  return payoutDb.rpc("get_payout_preview", {
    as_of_date: new Date().toISOString().slice(0, 10),
  }) as Promise<{ data: PayoutPreview[] | null; error: { message: string } | null }>;
}

export async function loadFundReleases() {
  return payoutDb
    .from("fund_releases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250) as Promise<{
    data: FundRelease[] | null;
    error: { message: string } | null;
  }>;
}

export async function loadPayoutReconciliation() {
  return payoutDb.rpc("get_payout_reconciliation_report") as Promise<{
    data: Array<{ issue_type: string; record_count: number; total_amount: number }> | null;
    error: { message: string } | null;
  }>;
}

export async function loadPayoutExecutionMode() {
  return payoutDb
    .from("payout_execution_settings")
    .select("execution_mode,max_attempts,retry_delay")
    .single() as Promise<{
    data: {
      execution_mode: "preview" | "manual_review" | "live";
      max_attempts: number;
      retry_delay: string;
    } | null;
    error: { message: string } | null;
  }>;
}

export async function loadCustomerPayouts(target: { circleId?: string; piggyId?: string }) {
  const [previewResult, releasesResult] = await Promise.all([
    loadPayoutPreview(),
    loadFundReleases(),
  ]);
  const previews = (previewResult.data ?? []).filter((item) =>
    target.circleId ? item.circle_id === target.circleId : item.piggy_id === target.piggyId,
  );
  const releases = (releasesResult.data ?? []).filter((item) =>
    target.circleId ? item.circle_id === target.circleId : item.piggy_id === target.piggyId,
  );
  return {
    previews,
    releases,
    error: previewResult.error?.message ?? releasesResult.error?.message ?? null,
  };
}
