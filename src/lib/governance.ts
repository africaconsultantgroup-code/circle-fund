import { supabase } from "@/lib/supabase";

export type GovernanceRequestType =
  | "member_removal"
  | "payment_extension"
  | "grace_period"
  | "partial_payment"
  | "temporary_pause"
  | "creator_transfer"
  | "beneficiary_change"
  | "goal_extension"
  | "goal_contribution_change"
  | "goal_close";

export type GovernanceRequestItem = {
  id: string;
  case_id: string;
  request_type: GovernanceRequestType;
  circle_id: string;
  circle_name: string;
  subject_user_id: string | null;
  reason_code: string;
  details: string | null;
  status: string;
  requested_at: string;
};

export type GovernanceDisputeItem = {
  id: string;
  case_id: string;
  dispute_type: string;
  circle_id: string | null;
  circle_name: string | null;
  title: string;
  status: string;
  priority: string;
  opened_at: string;
};

export type StandingAlertItem = {
  user_id: string;
  member_name: string;
  standing: string;
  score: number;
  late_payment_count: number;
  missed_payment_count: number;
  active_dispute_count: number;
};

export type CircleHealthItem = {
  circle_id: string;
  circle_name: string;
  health: string;
  score: number;
  outstanding_amount: number;
  missed_payment_count: number;
  active_dispute_count: number;
};

export type GovernanceDashboard = {
  summary: {
    open_requests: number;
    removal_requests: number;
    pending_disputes: number;
    standing_alerts: number;
    at_risk_circles: number;
    late_payments: number;
  };
  requests: GovernanceRequestItem[];
  disputes: GovernanceDisputeItem[];
  standing_alerts: StandingAlertItem[];
  circle_health: CircleHealthItem[];
};

export async function submitGovernanceRequest(input: {
  circleId: string;
  requestType: GovernanceRequestType;
  reasonCode: string;
  details?: string;
  subjectMembershipId?: string;
  evidenceSummary?: string;
}) {
  return supabase.rpc("submit_governance_request", {
    check_circle_id: input.circleId,
    check_request_type: input.requestType,
    check_reason_code: input.reasonCode,
    check_details: input.details ?? null,
    check_subject_membership_id: input.subjectMembershipId ?? null,
    check_evidence_summary: input.evidenceSummary ?? null,
  });
}

export async function loadGovernanceDashboard() {
  const result = await supabase.rpc("get_governance_dashboard");
  return {
    data: (result.data as GovernanceDashboard | null) ?? null,
    error: result.error,
  };
}

export async function openGovernanceDispute(input: {
  disputeType: "payment" | "contribution" | "beneficiary" | "member_removal" | "creator" | "payout";
  title: string;
  description: string;
  circleId?: string;
  againstUserId?: string;
  relatedRequestId?: string;
  relatedTransactionId?: string;
}) {
  return supabase.rpc("open_governance_dispute", {
    check_dispute_type: input.disputeType,
    check_title: input.title,
    check_description: input.description,
    check_circle_id: input.circleId ?? null,
    check_against_user_id: input.againstUserId ?? null,
    check_related_request_id: input.relatedRequestId ?? null,
    check_related_transaction_id: input.relatedTransactionId ?? null,
  });
}

export async function decideGovernanceRequest(
  requestId: string,
  decision: "approved" | "rejected",
  reason: string,
) {
  return supabase.rpc("decide_governance_request", {
    check_request_id: requestId,
    check_decision: decision,
    check_decision_reason: reason,
  });
}
