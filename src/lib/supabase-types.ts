export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type CircleStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type MemberStatus = 'active' | 'pending' | 'left' | 'removed';
export type ContributionStatus = 'pending' | 'processed' | 'failed';
export type PayoutStatus = 'pending' | 'completed' | 'failed';
export type TransactionType = 'contribution' | 'payout' | 'refund' | 'fee' | 'adjustment';
export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          updated_at?: string | null;
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
          frequency: string | null;
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
          frequency?: string | null;
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
          frequency?: string | null;
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
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          role?: string;
          status?: MemberStatus;
          joined_at?: string | null;
          invited_by?: string | null;
          updated_at?: string | null;
        };
      };
      contributions: {
        Row: {
          id: string;
          circle_id: string;
          user_id: string;
          amount: number;
          contribution_date: string | null;
          method: string | null;
          status: ContributionStatus;
          reference: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          user_id: string;
          amount: number;
          contribution_date?: string | null;
          method?: string | null;
          status?: ContributionStatus;
          reference?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          amount?: number;
          contribution_date?: string | null;
          method?: string | null;
          status?: ContributionStatus;
          reference?: string | null;
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
    };
    Views: {
      [_: string]: {
        Row: Record<string, unknown>;
      };
    };
    Functions: {
      [_: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      circle_status: CircleStatus;
      member_status: MemberStatus;
      contribution_status: ContributionStatus;
      payout_status: PayoutStatus;
      transaction_type: TransactionType;
      transaction_status: TransactionStatus;
    };
  };
}
