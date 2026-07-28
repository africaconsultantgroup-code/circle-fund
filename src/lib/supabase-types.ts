export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type CircleStatus = "active" | "paused" | "completed" | "cancelled" | "archived";
export type MemberStatus =
  | "pending"
  | "pending_capacity_review"
  | "approved"
  | "rejected"
  | "removed";
export type ContributionStatus =
  | "pending"
  | "processed"
  | "failed"
  | "unpaid"
  | "paid"
  | "late"
  | "overdue";
export type PayoutStatus = "pending" | "completed" | "failed";
export type PayoutScheduleStatus =
  | "scheduled"
  | "processing"
  | "pending"
  | "paid"
  | "skipped"
  | "failed";
export type TransactionType = "contribution" | "payout" | "refund" | "fee" | "adjustment";
export type TransactionStatus = "pending" | "completed" | "failed";
export type LegacyVerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type VerificationStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "failed"
  | "manual_review";
export type OtpStatus = "not_started" | "pending" | "verified" | "failed";
export type AccountStatus = "active" | "pending" | "suspended" | "disabled";
export type StaffRole = "super_admin" | "operations" | "compliance" | "finance" | "support";
export type UserRole = "customer" | StaffRole;
export type CurrencyCode = "GHS" | "GBP" | "USD" | "EUR";
export type PersonalSusuFrequency = "daily" | "weekly" | "biweekly" | "monthly";
export type PersonalSusuDurationUnit = "weeks" | "months";
export type PersonalSusuPlanStatus = "active" | "completed" | "cancelled";
export type PersonalSusuPaymentStatus = "pending" | "paid" | "failed";
export type PaymentTransactionStatus =
  | "initiated"
  | "pending"
  | "successful"
  | "failed"
  | "cancelled"
  | "reversed";
export type PaymentType = "contribution" | "savings" | "piggy_bag" | "wallet_deposit";
export type WalletTransactionType =
  | "deposit"
  | "contribution_payment"
  | "payout_received"
  | "piggy_bag_deposit"
  | "piggy_bag_withdrawal"
  | "savings_deposit"
  | "refund";
export type WalletTransactionDirection = "inflow" | "outflow" | "lock" | "unlock";
export type WalletTransactionStatus =
  | "pending"
  | "successful"
  | "confirmed"
  | "failed"
  | "cancelled";
export type AutomationType = "circle_autopay" | "piggy_autosave";
export type AutomationFrequency = PersonalSusuFrequency;
export type AutomationStatus = "active" | "paused" | "cancelled" | "completed";
export type AutomationAuthorizationStatus =
  | "pending"
  | "authorized"
  | "declined"
  | "revoked"
  | "not_required";
export type AutomationPaymentMethod = "mobile_money" | "wallet";
export type ScheduledPaymentStatus =
  | "scheduled"
  | "due"
  | "processing"
  | "successful"
  | "failed"
  | "retry_scheduled"
  | "overdue"
  | "cancelled";
export type ProtectedFundType = "circle" | "piggy";
export type ProtectedFundStatus =
  | "pending"
  | "protected"
  | "frozen"
  | "matured"
  | "release_pending"
  | "released"
  | "cancelled";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          name: string | null;
          email: string | null;
          phone: string | null;
          country: string | null;
          preferred_currency: CurrencyCode;
          expected_monthly_contribution: number | null;
          avatar_url: string | null;
          ghana_card_verification_status: LegacyVerificationStatus;
          selfie_image_url: string | null;
          profile_completed: boolean;
          account_status: AccountStatus;
          role: UserRole;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string | null;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          country?: string | null;
          preferred_currency?: CurrencyCode;
          expected_monthly_contribution?: number | null;
          avatar_url?: string | null;
          ghana_card_verification_status?: LegacyVerificationStatus;
          selfie_image_url?: string | null;
          profile_completed?: boolean;
          account_status?: AccountStatus;
          role?: UserRole;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          full_name?: string | null;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          country?: string | null;
          preferred_currency?: CurrencyCode;
          expected_monthly_contribution?: number | null;
          avatar_url?: string | null;
          ghana_card_verification_status?: LegacyVerificationStatus;
          selfie_image_url?: string | null;
          profile_completed?: boolean;
          account_status?: AccountStatus;
          role?: UserRole;
          updated_at?: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          staff_user_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          notes: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          staff_user_id?: string | null;
          action: string;
          target_type: string;
          target_id?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          staff_user_id?: string | null;
          action?: string;
          target_type?: string;
          target_id?: string | null;
          notes?: string | null;
          metadata?: Json;
        };
      };
      staff_invitations: {
        Row: {
          id: string;
          email: string;
          role: StaffRole;
          status: "pending" | "accepted" | "cancelled";
          invited_by: string | null;
          accepted_user_id: string | null;
          invited_at: string;
          accepted_at: string | null;
          cancelled_at: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          email: string;
          role: StaffRole;
          status?: "pending" | "accepted" | "cancelled";
          invited_by?: string | null;
          accepted_user_id?: string | null;
          invited_at?: string;
          accepted_at?: string | null;
          cancelled_at?: string | null;
          metadata?: Json;
        };
        Update: {
          email?: string;
          role?: StaffRole;
          status?: "pending" | "accepted" | "cancelled";
          invited_by?: string | null;
          accepted_user_id?: string | null;
          invited_at?: string;
          accepted_at?: string | null;
          cancelled_at?: string | null;
          metadata?: Json;
        };
      };
      circles: {
        Row: {
          id: string;
          circle_type: "rotational" | "goal";
          owner_id: string;
          name: string;
          description: string | null;
          goal_amount: number | null;
          contribution_amount: number | null;
          base_currency: CurrencyCode;
          frequency: string | null;
          max_members: number;
          invite_code: string | null;
          invite_token: string;
          start_date: string | null;
          end_date: string | null;
          status: CircleStatus;
          archived_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          circle_type?: "rotational" | "goal";
          owner_id: string;
          name: string;
          description?: string | null;
          goal_amount?: number | null;
          contribution_amount?: number | null;
          base_currency?: CurrencyCode;
          frequency?: string | null;
          max_members?: number;
          invite_code?: string | null;
          invite_token?: string;
          start_date?: string | null;
          end_date?: string | null;
          status?: CircleStatus;
          archived_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          circle_type?: "rotational" | "goal";
          name?: string;
          description?: string | null;
          goal_amount?: number | null;
          contribution_amount?: number | null;
          base_currency?: CurrencyCode;
          frequency?: string | null;
          max_members?: number;
          invite_code?: string | null;
          invite_token?: string;
          start_date?: string | null;
          end_date?: string | null;
          status?: CircleStatus;
          archived_at?: string | null;
          updated_at?: string | null;
        };
      };
      circle_members: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          role: string;
          status: MemberStatus;
          joined_at: string | null;
          invited_by: string | null;
          approved_at: string | null;
          approved_by: string | null;
          requires_capacity_review: boolean;
          capacity_review_status: "not_required" | "pending" | "approved" | "rejected";
          capacity_review_reason: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          role?: string;
          status?: MemberStatus;
          joined_at?: string | null;
          invited_by?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          requires_capacity_review?: boolean;
          capacity_review_status?: "not_required" | "pending" | "approved" | "rejected";
          capacity_review_reason?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          role?: string;
          status?: MemberStatus;
          joined_at?: string | null;
          invited_by?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          requires_capacity_review?: boolean;
          capacity_review_status?: "not_required" | "pending" | "approved" | "rejected";
          capacity_review_reason?: string | null;
          updated_at?: string | null;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          circle_id: string | null;
          membership_id: string | null;
          type:
            | "join_request"
            | "membership_approved"
            | "membership_rejected"
            | "payment_due_tomorrow"
            | "payment_due_today"
            | "payment_successful"
            | "payment_failed"
            | "payment_retry_scheduled"
            | "payment_overdue";
          automation_id: string | null;
          scheduled_payment_id: string | null;
          title: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          circle_id?: string | null;
          membership_id?: string | null;
          type:
            | "join_request"
            | "membership_approved"
            | "membership_rejected"
            | "payment_due_tomorrow"
            | "payment_due_today"
            | "payment_successful"
            | "payment_failed"
            | "payment_retry_scheduled"
            | "payment_overdue";
          automation_id?: string | null;
          scheduled_payment_id?: string | null;
          title: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
      };
      payment_automations: {
        Row: {
          id: string;
          user_id: string;
          automation_type: AutomationType;
          circle_id: string | null;
          piggy_id: string | null;
          amount: number;
          frequency: AutomationFrequency;
          payment_method: AutomationPaymentMethod;
          phone_number: string | null;
          status: AutomationStatus;
          authorization_status: AutomationAuthorizationStatus;
          authorization_reference: string | null;
          next_collection_date: string;
          last_collection_date: string | null;
          last_successful_collection_date: string | null;
          last_failed_collection_date: string | null;
          retry_count: number;
          max_retries: number;
          failure_reason: string | null;
          paused_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      scheduled_payments: {
        Row: {
          id: string;
          automation_id: string;
          user_id: string;
          circle_id: string | null;
          piggy_id: string | null;
          contribution_id: string | null;
          payment_type: "circle_contribution" | "piggy_autosave";
          amount: number;
          due_date: string;
          status: ScheduledPaymentStatus;
          attempt_count: number;
          payment_transaction_id: string | null;
          provider_reference: string | null;
          last_attempt_at: string | null;
          next_retry_at: string | null;
          failure_reason: string | null;
          reminder_24h_sent_at: string | null;
          due_reminder_sent_at: string | null;
          final_failure_notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      capacity_reviews: {
        Row: {
          id: string;
          user_id: string;
          circle_id: string;
          member_id: string | null;
          active_circle_count: number;
          estimated_periodic_obligation: number;
          requested_reason: string | null;
          income_employment_info: string | null;
          missed_late_contribution_count: number;
          trust_score: number | null;
          verification_status: string | null;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          circle_id: string;
          member_id?: string | null;
          active_circle_count?: number;
          estimated_periodic_obligation?: number;
          requested_reason?: string | null;
          income_employment_info?: string | null;
          missed_late_contribution_count?: number;
          trust_score?: number | null;
          verification_status?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          member_id?: string | null;
          active_circle_count?: number;
          estimated_periodic_obligation?: number;
          requested_reason?: string | null;
          income_employment_info?: string | null;
          missed_late_contribution_count?: number;
          trust_score?: number | null;
          verification_status?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_notes?: string | null;
          updated_at?: string;
        };
      };
      user_verifications: {
        Row: {
          id: string;
          user_id: string;
          phone_number: string | null;
          ghana_card_number_hash: string | null;
          phone_verified: boolean;
          phone_verified_at: string | null;
          otp_status: OtpStatus;
          otp_reference: string | null;
          otp_verified_at: string | null;
          otp_code_hash: string | null;
          otp_expires_at: string | null;
          ghana_card_verified: boolean;
          ghana_card_status: VerificationStatus;
          face_verified: boolean;
          face_status: VerificationStatus;
          selfie_uploaded: boolean;
          verification_provider: string | null;
          provider_reference: string | null;
          verification_status: VerificationStatus;
          is_test_verification: boolean;
          failure_reason: string | null;
          verified_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone_number?: string | null;
          ghana_card_number_hash?: string | null;
          phone_verified?: boolean;
          phone_verified_at?: string | null;
          otp_status?: OtpStatus;
          otp_reference?: string | null;
          otp_verified_at?: string | null;
          otp_code_hash?: string | null;
          otp_expires_at?: string | null;
          ghana_card_verified?: boolean;
          ghana_card_status?: VerificationStatus;
          face_verified?: boolean;
          face_status?: VerificationStatus;
          selfie_uploaded?: boolean;
          verification_provider?: string | null;
          provider_reference?: string | null;
          verification_status?: VerificationStatus;
          is_test_verification?: boolean;
          failure_reason?: string | null;
          verified_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          phone_number?: string | null;
          ghana_card_number_hash?: string | null;
          phone_verified?: boolean;
          phone_verified_at?: string | null;
          otp_status?: OtpStatus;
          otp_reference?: string | null;
          otp_verified_at?: string | null;
          otp_code_hash?: string | null;
          otp_expires_at?: string | null;
          ghana_card_verified?: boolean;
          ghana_card_status?: VerificationStatus;
          face_verified?: boolean;
          face_status?: VerificationStatus;
          selfie_uploaded?: boolean;
          verification_provider?: string | null;
          provider_reference?: string | null;
          verification_status?: VerificationStatus;
          is_test_verification?: boolean;
          failure_reason?: string | null;
          verified_at?: string | null;
          updated_at?: string | null;
        };
      };
      contributions: {
        Row: {
          id: string;
          circle_id: string;
          member_id: string | null;
          user_id: string;
          amount: number;
          amount_due: number | null;
          contribution_date: string | null;
          due_date: string | null;
          method: string | null;
          status: ContributionStatus;
          reference: string | null;
          paid_at: string | null;
          payment_reference: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          member_id?: string | null;
          user_id: string;
          amount: number;
          amount_due?: number | null;
          contribution_date?: string | null;
          due_date?: string | null;
          method?: string | null;
          status?: ContributionStatus;
          reference?: string | null;
          paid_at?: string | null;
          payment_reference?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          member_id?: string | null;
          amount?: number;
          amount_due?: number | null;
          contribution_date?: string | null;
          due_date?: string | null;
          method?: string | null;
          status?: ContributionStatus;
          reference?: string | null;
          paid_at?: string | null;
          payment_reference?: string | null;
          updated_at?: string | null;
        };
      };
      payouts: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          amount: number;
          payout_date: string | null;
          status: PayoutStatus;
          method: string | null;
          reference: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          amount: number;
          payout_date?: string | null;
          status?: PayoutStatus;
          method?: string | null;
          reference?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          amount?: number;
          payout_date?: string | null;
          status?: PayoutStatus;
          method?: string | null;
          reference?: string | null;
          updated_at?: string | null;
        };
      };
      payout_schedule: {
        Row: {
          id: string;
          circle_id: string;
          member_id: string;
          rotation_position: number;
          payout_due_date: string | null;
          payout_amount: number;
          status: PayoutScheduleStatus;
          locked_at: string | null;
          locked_by: string | null;
          automatic_attempted_at: string | null;
          manual_attempted_at: string | null;
          payout_reference: string | null;
          hold_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          member_id: string;
          rotation_position: number;
          payout_due_date?: string | null;
          payout_amount?: number;
          status?: PayoutScheduleStatus;
          locked_at?: string | null;
          locked_by?: string | null;
          automatic_attempted_at?: string | null;
          manual_attempted_at?: string | null;
          payout_reference?: string | null;
          hold_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          rotation_position?: number;
          payout_due_date?: string | null;
          payout_amount?: number;
          status?: PayoutScheduleStatus;
          locked_at?: string | null;
          locked_by?: string | null;
          automatic_attempted_at?: string | null;
          manual_attempted_at?: string | null;
          payout_reference?: string | null;
          hold_reason?: string | null;
          updated_at?: string;
        };
      };
      payment_transactions: {
        Row: {
          id: string;
          user_id: string;
          circle_id: string | null;
          contribution_id: string | null;
          amount: number;
          currency: string;
          payment_method: string | null;
          provider: string;
          provider_reference: string | null;
          status: PaymentTransactionStatus;
          payment_type: PaymentType;
          provider_response: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          circle_id?: string | null;
          contribution_id?: string | null;
          amount: number;
          currency?: string;
          payment_method?: string | null;
          provider?: string;
          provider_reference?: string | null;
          status?: PaymentTransactionStatus;
          payment_type?: PaymentType;
          provider_response?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          circle_id?: string | null;
          contribution_id?: string | null;
          amount?: number;
          currency?: string;
          payment_method?: string | null;
          provider?: string;
          provider_reference?: string | null;
          status?: PaymentTransactionStatus;
          payment_type?: PaymentType;
          provider_response?: Json;
          updated_at?: string;
        };
      };
      contribution_payments: {
        Row: {
          id: string;
          contribution_id: string;
          payment_transaction_id: string;
          user_id: string;
          circle_id: string | null;
          amount: number;
          status: PaymentTransactionStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contribution_id: string;
          payment_transaction_id: string;
          user_id: string;
          circle_id?: string | null;
          amount: number;
          status?: PaymentTransactionStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          status?: PaymentTransactionStatus;
          updated_at?: string;
        };
      };
      payment_webhook_events: {
        Row: {
          id: string;
          provider: string;
          provider_reference: string | null;
          event_type: string | null;
          payload: Json;
          processing_status: string;
          processing_error: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_reference?: string | null;
          event_type?: string | null;
          payload?: Json;
          processing_status?: string;
          processing_error?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          provider_reference?: string | null;
          event_type?: string | null;
          payload?: Json;
          processing_status?: string;
          processing_error?: string | null;
          processed_at?: string | null;
        };
      };
      wallet_accounts: {
        Row: {
          id: string;
          user_id: string;
          available_balance: number;
          locked_balance: number;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          available_balance?: number;
          locked_balance?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          available_balance?: number;
          locked_balance?: number;
          currency?: string;
          updated_at?: string;
        };
      };
      wallet_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          user_id: string;
          circle_id: string | null;
          contribution_id: string | null;
          payout_schedule_id: string | null;
          payment_transaction_id: string | null;
          transaction_type: WalletTransactionType;
          amount: number;
          currency: string;
          direction: WalletTransactionDirection;
          status: WalletTransactionStatus;
          payment_method: string | null;
          provider: string;
          reference: string;
          receipt_id: string;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          user_id: string;
          circle_id?: string | null;
          contribution_id?: string | null;
          payout_schedule_id?: string | null;
          payment_transaction_id?: string | null;
          transaction_type: WalletTransactionType;
          amount: number;
          currency?: string;
          direction: WalletTransactionDirection;
          status?: WalletTransactionStatus;
          payment_method?: string | null;
          provider?: string;
          reference?: string;
          receipt_id?: string;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          circle_id?: string | null;
          contribution_id?: string | null;
          payout_schedule_id?: string | null;
          payment_transaction_id?: string | null;
          transaction_type?: WalletTransactionType;
          amount?: number;
          currency?: string;
          direction?: WalletTransactionDirection;
          status?: WalletTransactionStatus;
          payment_method?: string | null;
          provider?: string;
          reference?: string;
          receipt_id?: string;
          notes?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          circle_id: string | null;
          type: TransactionType;
          amount: number;
          currency: string;
          status: TransactionStatus;
          description: string | null;
          reference: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          circle_id?: string | null;
          type: TransactionType;
          amount: number;
          currency: string;
          status?: TransactionStatus;
          description?: string | null;
          reference?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          circle_id?: string | null;
          type?: TransactionType;
          amount?: number;
          currency?: string;
          status?: TransactionStatus;
          description?: string | null;
          reference?: string | null;
          updated_at?: string | null;
        };
      };
      personal_susu_plans: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount: number;
          frequency: PersonalSusuFrequency;
          duration: number;
          duration_unit: PersonalSusuDurationUnit;
          start_date: string;
          end_date: string;
          status: PersonalSusuPlanStatus;
          locked_until: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_amount: number;
          frequency: PersonalSusuFrequency;
          duration: number;
          duration_unit?: PersonalSusuDurationUnit;
          start_date: string;
          end_date: string;
          status?: PersonalSusuPlanStatus;
          locked_until: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          target_amount?: number;
          frequency?: PersonalSusuFrequency;
          duration?: number;
          duration_unit?: PersonalSusuDurationUnit;
          start_date?: string;
          end_date?: string;
          status?: PersonalSusuPlanStatus;
          locked_until?: string;
          updated_at?: string;
        };
      };
      personal_susu_deposits: {
        Row: {
          id: string;
          plan_id: string;
          user_id: string;
          amount: number;
          payment_status: PersonalSusuPaymentStatus;
          provider: string | null;
          transaction_reference: string | null;
          payment_transaction_id: string | null;
          deposited_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          user_id: string;
          amount: number;
          payment_status?: PersonalSusuPaymentStatus;
          provider?: string | null;
          transaction_reference?: string | null;
          payment_transaction_id?: string | null;
          deposited_at?: string;
          created_at?: string;
        };
        Update: {
          amount?: number;
          payment_status?: PersonalSusuPaymentStatus;
          provider?: string | null;
          transaction_reference?: string | null;
          payment_transaction_id?: string | null;
          deposited_at?: string;
        };
      };
      protected_fund_ledger: {
        Row: {
          id: string;
          user_id: string;
          fund_type: ProtectedFundType;
          circle_id: string | null;
          piggy_id: string | null;
          source_transaction_id: string | null;
          source_payment_transaction_id: string | null;
          source_deposit_id: string | null;
          beneficiary_user_id: string | null;
          amount: number;
          currency: string;
          status: ProtectedFundStatus;
          maturity_date: string | null;
          protected_at: string;
          matured_at: string | null;
          released_at: string | null;
          frozen_at: string | null;
          unfrozen_at: string | null;
          freeze_reason: string | null;
          release_transaction_id: string | null;
          custody_provider: string | null;
          custody_account_reference: string | null;
          custody_subaccount_reference: string | null;
          external_fund_reference: string | null;
          settlement_status: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      protected_fund_events: {
        Row: {
          id: string;
          protected_fund_id: string;
          actor_user_id: string | null;
          event_type: string;
          amount: number | null;
          reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
      };
      protection_reconciliation_queue: {
        Row: {
          id: string;
          issue_type: string;
          source_payment_transaction_id: string | null;
          source_transaction_id: string | null;
          protected_fund_id: string | null;
          details: Json;
          status: string;
          detected_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
          resolution_notes: string | null;
        };
        Insert: never;
        Update: never;
      };
      admin_bootstrap_emails: {
        Row: {
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_: string]: {
        Row: Record<string, unknown>;
      };
    };
    Functions: {
      create_goal_susu: {
        Args: {
          goal_name: string;
          goal_description: string;
          target_amount: number;
          contribution_amount: number;
          contribution_frequency: string;
          first_contribution_date: string;
          maturity_date: string;
          maximum_members: number;
          currency: string;
          invite_value: string;
          beneficiary_type: string;
          beneficiary_user_id: string | null;
          beneficiary_name: string;
          destination_reference: string;
          mobile_money_network: string;
          relationship_or_purpose?: string | null;
        };
        Returns: Database["public"]["Tables"]["circles"]["Row"];
      };
      get_goal_susu_join_preview: {
        Args: { invite_value: string };
        Returns: Array<{
          circle_id: string;
          circle_name: string;
          goal_description: string | null;
          target_amount: number;
          contribution_amount: number;
          contribution_frequency: string;
          payout_frequency: string;
          start_date: string;
          end_date: string;
          max_members: number;
          beneficiary_name: string;
          beneficiary_type: string;
          masked_destination: string;
          verification_status: string;
          twice_monthly_day_one: number | null;
          twice_monthly_day_two: number | null;
        }>;
      };
      create_goal_susu_with_cycles: {
        Args: {
          goal_name: string;
          goal_description: string;
          target_amount: number;
          contribution_amount: number;
          contribution_frequency: string;
          payout_frequency: string;
          overall_start_date: string;
          overall_end_date: string;
          maximum_members: number;
          currency: string;
          invite_value: string;
          beneficiary_type: string;
          beneficiary_user_id: string | null;
          beneficiary_name: string;
          destination_reference: string;
          mobile_money_network: string;
          relationship_or_purpose?: string | null;
          twice_monthly_day_one?: number | null;
          twice_monthly_day_two?: number | null;
        };
        Returns: Database["public"]["Tables"]["circles"]["Row"];
      };
      get_goal_susu_cycles: {
        Args: { check_circle_id: string };
        Returns: Array<{
          cycle_id: string;
          cycle_number: number;
          cycle_start_date: string;
          cycle_end_date: string;
          payout_date: string;
          expected_amount: number;
          confirmed_amount: number;
          protected_amount: number;
          outstanding_amount: number;
          status: string;
        }>;
      };
      accept_goal_susu_terms: {
        Args: { check_circle_id: string };
        Returns: {
          id: string;
          circle_id: string;
          membership_id: string;
          user_id: string;
          terms_version: number;
          accepted_at: string;
          agreement_snapshot: Json;
          created_at: string;
        };
      };
      goal_susu_progress: {
        Args: { check_circle_id: string };
        Returns: Array<{
          target_amount: number;
          collected_amount: number;
          protected_amount: number;
          pending_amount: number;
          outstanding_amount: number;
          progress_percent: number;
          maturity_date: string;
          days_remaining: number;
          members_paid: number;
          members_outstanding: number;
          lifecycle_status: string;
          payout_status: string;
          beneficiary_name: string;
          masked_destination: string;
          verification_status: string;
        }>;
      };
      enable_payment_automation: {
        Args: {
          requested_type: AutomationType;
          requested_circle_id?: string | null;
          requested_piggy_id?: string | null;
          requested_amount?: number | null;
          requested_frequency?: AutomationFrequency | null;
          requested_payment_method?: AutomationPaymentMethod;
          requested_phone_number?: string | null;
          requested_start_date?: string;
          requested_max_retries?: number;
        };
        Returns: Database["public"]["Tables"]["payment_automations"]["Row"];
      };
      set_payment_automation_status: {
        Args: { check_automation_id: string; requested_action: "pause" | "resume" | "cancel" };
        Returns: Database["public"]["Tables"]["payment_automations"]["Row"];
      };
      get_automation_admin_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          status: ScheduledPaymentStatus;
          payment_count: number;
          total_amount: number;
        }>;
      };
      get_customer_protected_fund_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          available_wallet_balance: number;
          protected_circle_funds: number;
          protected_piggy_funds: number;
          pending_balance: number;
          matured_eligible_balance: number;
          frozen_balance: number;
          currency: string;
        }>;
      };
      get_circle_protected_fund_summary: {
        Args: { check_circle_id: string };
        Returns: Array<{
          total_protected: number;
          pending: number;
          frozen: number;
          matured: number;
          released: number;
          remaining_protected: number;
          my_protected: number;
        }>;
      };
      set_protected_fund_freeze: {
        Args: { check_fund_id: string; requested_action: "freeze" | "unfreeze"; reason: string };
        Returns: Database["public"]["Tables"]["protected_fund_ledger"]["Row"];
      };
      get_protection_reconciliation_report: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ issue_type: string; record_count: number; total_amount: number }>;
      };
      get_circle_lifecycle_eligibility: {
        Args: { check_circle_id: string };
        Returns: Array<{
          can_delete: boolean;
          approved_member_count: number;
          pending_member_count: number;
          contribution_count: number;
          payout_count: number;
          payment_transaction_count: number;
          wallet_transaction_count: number;
          transaction_count: number;
        }>;
      };
      delete_circle: {
        Args: { check_circle_id: string };
        Returns: boolean;
      };
      archive_circle: {
        Args: { check_circle_id: string };
        Returns: Database["public"]["Tables"]["circles"]["Row"];
      };
      user_passes_circle_onboarding: {
        Args: { check_user_id: string };
        Returns: boolean;
      };
      user_has_verified_phone: {
        Args: { check_user_id: string };
        Returns: boolean;
      };
      circle_has_member_capacity: {
        Args: { check_circle_id: string };
        Returns: boolean;
      };
      user_active_circle_admin_count: {
        Args: { check_user_id: string };
        Returns: number;
      };
      user_active_circle_count: {
        Args: { check_user_id: string };
        Returns: number;
      };
      can_create_circle: {
        Args: { check_user_id: string; log_block?: boolean };
        Returns: Array<{
          can_create: boolean;
          active_admin_count: number;
          max_admin_circles: number;
          reason: string;
        }>;
      };
      can_join_circle: {
        Args: { check_user_id: string; check_circle_id: string; log_block?: boolean };
        Returns: Array<{
          can_join: boolean;
          requires_capacity_review: boolean;
          active_circle_count: number;
          max_circles_without_review: number;
          reason: string;
        }>;
      };
      user_periodic_obligation: {
        Args: { check_user_id: string };
        Returns: number;
      };
      circle_member_count: {
        Args: { check_circle_id: string };
        Returns: number;
      };
      circle_pending_member_count: {
        Args: { check_circle_id: string };
        Returns: number;
      };
      user_has_circle_membership: {
        Args: { check_circle_id: string; check_user_id: string };
        Returns: boolean;
      };
      get_circle_members: {
        Args: { check_circle_id: string };
        Returns: Array<{
          membership_id: string;
          circle_id: string;
          user_id: string;
          role: string;
          status: string;
          joined_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          full_name: string | null;
          phone: string | null;
          country: string | null;
          preferred_currency: string | null;
          verification_status: string;
          requires_capacity_review: boolean;
          capacity_review_status: string;
        }>;
      };
      get_circle_access: {
        Args: { check_circle_id: string };
        Returns: Array<{
          found: boolean;
          access_granted: boolean;
          id: string | null;
          owner_id: string | null;
          name: string | null;
          description: string | null;
          contribution_amount: number | null;
          base_currency: CurrencyCode | null;
          frequency: string | null;
          max_members: number | null;
          invite_code: string | null;
          invite_token: string | null;
          start_date: string | null;
          status: CircleStatus | null;
        }>;
      };
      manage_circle_member: {
        Args: { check_membership_id: string; action: string };
        Returns: Database["public"]["Tables"]["circle_members"]["Row"];
      };
      admin_manage_capacity_review: {
        Args: { check_review_id: string; action: "approve" | "reject"; notes?: string | null };
        Returns: Database["public"]["Tables"]["capacity_reviews"]["Row"];
      };
      admin_reconcile_hubtel_payment: {
        Args: { check_provider_reference: string; reconciliation_notes?: string | null };
        Returns: Database["public"]["Tables"]["payment_transactions"]["Row"];
      };
      admin_find_hubtel_payment: {
        Args: { check_provider_reference: string };
        Returns: Array<{
          id: string;
          user_id: string;
          circle_id: string | null;
          contribution_id: string | null;
          amount: number;
          currency: string;
          payment_method: string | null;
          provider: string;
          provider_reference: string | null;
          status: string;
          payment_type: string;
          provider_response: Json;
          created_at: string;
          updated_at: string;
          user_name: string | null;
          user_email: string | null;
          circle_name: string | null;
          wallet_transaction_id: string | null;
          wallet_status: string | null;
          receipt_id: string | null;
        }>;
      };
      get_circle_contribution_status: {
        Args: { check_circle_id: string };
        Returns: Array<{
          contribution_id: string;
          member_id: string | null;
          user_id: string;
          full_name: string | null;
          expected_amount: number;
          due_date: string | null;
          status: string;
          paid_at: string | null;
          payment_reference: string | null;
          payment_transaction_id: string | null;
          payment_status: string | null;
          payment_provider: string | null;
          payment_created_at: string | null;
        }>;
      };
      generate_circle_contribution_schedule: {
        Args: { check_circle_id: string; periods?: number };
        Returns: number;
      };
      initiate_hubtel_contribution_payment: {
        Args: { check_contribution_id: string };
        Returns: Database["public"]["Tables"]["payment_transactions"]["Row"];
      };
      initiate_placeholder_payment: {
        Args: {
          payment_type: PaymentType;
          amount: number;
          currency?: string;
          circle_id?: string | null;
          contribution_id?: string | null;
          provider_response?: Json;
        };
        Returns: Database["public"]["Tables"]["payment_transactions"]["Row"];
      };
      record_hubtel_payment_webhook: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["payment_webhook_events"]["Row"];
      };
      ensure_wallet_account: {
        Args: { check_user_id: string; wallet_currency?: string };
        Returns: Database["public"]["Tables"]["wallet_accounts"]["Row"];
      };
      get_wallet_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          wallet_id: string;
          available_balance: number;
          locked_balance: number;
          total_deposits: number;
          total_withdrawals: number;
          monthly_inflow: number;
          monthly_outflow: number;
          currency: string;
        }>;
      };
      get_customer_financial_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          total_paid: number;
          total_deposited: number;
          total_contributed: number;
          piggy_balance: number;
          savings_balance: number;
          available_wallet_balance: number;
          locked_balance: number;
          total_received: number;
          currency: string;
          susu_contributions: number;
          savings_toward_susu: number;
          piggy_savings: number;
          wallet_deposits: number;
          expected_payout_total: number;
          pending_payments: number;
          failed_payments: number;
        }>;
      };
      get_customer_payment_breakdown: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          payment_type: string;
          label: string;
          confirmed_amount: number;
          pending_amount: number;
          failed_amount: number;
          confirmed_count: number;
          pending_count: number;
          failed_count: number;
        }>;
      };
      get_customer_received_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          total_received: number;
          expected_payout_total: number;
          next_expected_payout_amount: number;
          next_expected_payout_date: string | null;
          active_group_count: number;
          currency: string;
        }>;
      };
      get_circle_member_financial_summary: {
        Args: { check_circle_id: string };
        Returns: Array<{
          circle_id: string;
          user_id: string;
          susu_contributions_paid: number;
          contribution_pending: number;
          contribution_overdue: number;
          contribution_failed: number;
          confirmed_payments: number;
          pending_payments: number;
          failed_payments: number;
          total_received: number;
          expected_payout: number;
          expected_payout_date: string | null;
          receipt_count: number;
          currency: string;
        }>;
      };
      get_customer_payment_history: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          transaction_id: string;
          wallet_transaction_id: string | null;
          payment_type: string;
          service_type: string;
          amount: number;
          currency: string;
          status: string;
          provider: string;
          provider_reference: string | null;
          receipt_id: string | null;
          payment_method: string | null;
          created_at: string;
          completed_at: string | null;
        }>;
      };
      get_piggy_financial_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          plan_id: string;
          plan_name: string;
          target_amount: number;
          total_deposited: number;
          locked_amount: number;
          progress_percentage: number;
          payment_count: number;
          last_payment_at: string | null;
        }>;
      };
      get_circle_payment_summary: {
        Args: { check_circle_id: string };
        Returns: Array<{
          circle_id: string;
          total_expected: number;
          total_paid: number;
          pending_amount: number;
          overdue_amount: number;
          failed_amount: number;
          members_paid: number;
          members_pending: number;
          members_overdue: number;
          funding_progress: number;
        }>;
      };
      prepare_wallet_deposit: {
        Args: { amount: number; payment_method: string; currency?: string };
        Returns: Database["public"]["Tables"]["wallet_transactions"]["Row"];
      };
      pay_contribution_from_wallet: {
        Args: { check_contribution_id: string };
        Returns: Database["public"]["Tables"]["wallet_transactions"]["Row"];
      };
      pay_from_wallet: {
        Args: {
          payment_type: "contribution" | "piggy_bag" | "savings";
          amount?: number | null;
          currency?: string | null;
          circle_id?: string | null;
          contribution_id?: string | null;
          plan_id?: string | null;
          metadata?: Json;
        };
        Returns: Database["public"]["Tables"]["wallet_transactions"]["Row"];
      };
      receive_payout_to_wallet: {
        Args: { check_schedule_id: string };
        Returns: Database["public"]["Tables"]["wallet_transactions"]["Row"];
      };
      circle_rotation_is_locked: {
        Args: { check_circle_id: string };
        Returns: boolean;
      };
      generate_circle_payout_rotation: {
        Args: { check_circle_id: string; regenerate?: boolean };
        Returns: number;
      };
      lock_circle_payout_rotation: {
        Args: { check_circle_id: string };
        Returns: number;
      };
      get_circle_payout_rotation: {
        Args: { check_circle_id: string };
        Returns: Array<{
          schedule_id: string;
          circle_id: string;
          member_id: string;
          user_id: string;
          full_name: string | null;
          role: string | null;
          verification_status: string;
          rotation_position: number;
          payout_due_date: string | null;
          payout_amount: number;
          status: string;
          locked_at: string | null;
          is_current_user: boolean;
        }>;
      };
      list_due_payouts_for_admin: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          schedule_id: string;
          circle_id: string;
          circle_name: string | null;
          member_id: string;
          user_id: string;
          full_name: string | null;
          payout_due_date: string | null;
          payout_amount: number;
          status: string;
          payout_reference: string | null;
          hold_reason: string | null;
          automatic_attempted_at: string | null;
          manual_attempted_at: string | null;
        }>;
      };
      manual_trigger_payout: {
        Args: { check_schedule_id: string; reason: string };
        Returns: Database["public"]["Tables"]["payout_schedule"]["Row"];
      };
      place_payout_hold: {
        Args: { check_schedule_id: string; reason: string };
        Returns: Database["public"]["Tables"]["payout_schedule"]["Row"];
      };
      release_payout_hold: {
        Args: { check_schedule_id: string; reason?: string | null };
        Returns: Database["public"]["Tables"]["payout_schedule"]["Row"];
      };
      submit_governance_request: {
        Args: {
          check_circle_id: string;
          check_request_type: string;
          check_reason_code: string;
          check_details?: string | null;
          check_subject_membership_id?: string | null;
          check_evidence_summary?: string | null;
        };
        Returns: Json;
      };
      open_governance_dispute: {
        Args: {
          check_dispute_type: string;
          check_title: string;
          check_description: string;
          check_circle_id?: string | null;
          check_against_user_id?: string | null;
          check_related_request_id?: string | null;
          check_related_transaction_id?: string | null;
        };
        Returns: Json;
      };
      decide_governance_request: {
        Args: {
          check_request_id: string;
          check_decision: "approved" | "rejected";
          check_decision_reason: string;
        };
        Returns: Json;
      };
      get_governance_dashboard: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      current_user_is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      bootstrap_current_user_admin: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          user_id: string;
          email: string;
          role: string;
          account_status: string;
          promoted: boolean;
        }>;
      };
    };
    Enums: {
      circle_status: CircleStatus;
      member_status: MemberStatus;
      contribution_status: ContributionStatus;
      payout_status: PayoutStatus;
      transaction_type: TransactionType;
      transaction_status: TransactionStatus;
      otp_status: OtpStatus;
    };
  };
}

/**
 * Supabase's query builder expects generated table definitions to include a
 * Relationships field. The schema in this project is maintained by hand, so
 * add the empty relationship metadata without duplicating it on every table.
 */
export type SupabaseDatabase = {
  public: Omit<Database["public"], "Tables"> & {
    Tables: {
      [TableName in keyof Database["public"]["Tables"]]: Database["public"]["Tables"][TableName] & {
        Relationships: TableName extends "circle_members"
          ? [
              {
                foreignKeyName: "circle_members_circle_id_fkey";
                columns: ["circle_id"];
                isOneToOne: false;
                referencedRelation: "circles";
                referencedColumns: ["id"];
              },
            ]
          : TableName extends "contributions"
            ? [
                {
                  foreignKeyName: "contributions_circle_id_fkey";
                  columns: ["circle_id"];
                  isOneToOne: false;
                  referencedRelation: "circles";
                  referencedColumns: ["id"];
                },
              ]
            : TableName extends "wallet_transactions"
              ? [
                  {
                    foreignKeyName: "wallet_transactions_circle_id_fkey";
                    columns: ["circle_id"];
                    isOneToOne: false;
                    referencedRelation: "circles";
                    referencedColumns: ["id"];
                  },
                ]
              : [];
      };
    };
    Views: Record<string, never>;
  };
};
