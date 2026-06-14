export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type CircleStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'removed';
export type ContributionStatus = 'pending' | 'processed' | 'failed' | 'unpaid' | 'paid' | 'late' | 'overdue';
export type PayoutStatus = 'pending' | 'completed' | 'failed';
export type TransactionType = 'contribution' | 'payout' | 'refund' | 'fee' | 'adjustment';
export type TransactionStatus = 'pending' | 'completed' | 'failed';
export type LegacyVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type VerificationStatus = 'not_started' | 'pending' | 'verified' | 'failed' | 'manual_review';
export type OtpStatus = 'not_started' | 'pending' | 'verified' | 'failed';
export type AccountStatus = 'active' | 'pending' | 'suspended' | 'disabled';
export type StaffRole = 'super_admin' | 'operations' | 'compliance' | 'finance' | 'support';
export type UserRole = 'customer' | StaffRole;
export type CurrencyCode = 'GHS' | 'GBP' | 'USD' | 'EUR';
export type PersonalSusuFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type PersonalSusuDurationUnit = 'weeks' | 'months';
export type PersonalSusuPlanStatus = 'active' | 'completed' | 'cancelled';
export type PersonalSusuPaymentStatus = 'pending' | 'paid' | 'failed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
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
          status: 'pending' | 'accepted' | 'cancelled';
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
          status?: 'pending' | 'accepted' | 'cancelled';
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
          status?: 'pending' | 'accepted' | 'cancelled';
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
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
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
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
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
          updated_at?: string | null;
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
          deposited_at?: string;
          created_at?: string;
        };
        Update: {
          amount?: number;
          payment_status?: PersonalSusuPaymentStatus;
          provider?: string | null;
          transaction_reference?: string | null;
          deposited_at?: string;
        };
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
        Returns: Database['public']['Tables']['circle_members']['Row'];
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
        }>;
      };
      generate_circle_contribution_schedule: {
        Args: { check_circle_id: string; periods?: number };
        Returns: number;
      };
      mark_contribution_paid_for_testing: {
        Args: { check_contribution_id: string; payment_reference?: string | null };
        Returns: Database['public']['Tables']['contributions']['Row'];
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
