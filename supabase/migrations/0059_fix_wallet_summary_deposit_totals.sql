-- 0059_fix_wallet_summary_deposit_totals.sql
-- Wallet summary deposits include all confirmed customer money paid into SikaCircle, including locked Piggy Bag funds.

create or replace function public.get_wallet_summary()
returns table (
  wallet_id uuid,
  available_balance numeric,
  locked_balance numeric,
  total_deposits numeric,
  total_withdrawals numeric,
  monthly_inflow numeric,
  monthly_outflow numeric,
  currency text
)
language sql
security definer
set search_path = public
stable
as $$
  with wallet as (
    select *
    from public.wallet_accounts
    where user_id = auth.uid()
    limit 1
  ),
  confirmed_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status in ('successful', 'confirmed')
  ),
  paid_into_sikacircle as (
    select *
    from confirmed_wallet
    where transaction_type in (
      'deposit',
      'contribution_payment',
      'piggy_bag_deposit',
      'savings_deposit'
    )
  ),
  withdrawn_or_paid_out as (
    select *
    from confirmed_wallet
    where transaction_type in (
      'piggy_bag_withdrawal',
      'refund'
    )
      or direction in ('outflow', 'unlock')
  )
  select
    (select id from wallet),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    coalesce((select sum(amount) from paid_into_sikacircle), 0),
    coalesce((select sum(amount) from withdrawn_or_paid_out), 0),
    coalesce((select sum(amount) from paid_into_sikacircle where created_at >= date_trunc('month', now())), 0),
    coalesce((select sum(amount) from withdrawn_or_paid_out where created_at >= date_trunc('month', now())), 0),
    coalesce((select currency from wallet), 'GHS');
$$;

notify pgrst, 'reload schema';
