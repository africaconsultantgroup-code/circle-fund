-- 0051_read_only_financial_summaries.sql
-- Keeps dashboard/payment summary RPCs read-only. Wallet rows are created only by money actions/webhooks.

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
  successful_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status = 'successful'
  )
  select
    (select id from wallet),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    coalesce((select sum(amount) from successful_wallet where direction = 'inflow'), 0),
    coalesce((select sum(amount) from successful_wallet where direction = 'outflow'), 0),
    coalesce((select sum(amount) from successful_wallet where direction = 'inflow' and created_at >= date_trunc('month', now())), 0),
    coalesce((select sum(amount) from successful_wallet where direction = 'outflow' and created_at >= date_trunc('month', now())), 0),
    coalesce((select currency from wallet), 'GHS');
$$;

create or replace function public.get_customer_financial_summary()
returns table (
  total_paid numeric,
  total_deposited numeric,
  total_contributed numeric,
  piggy_balance numeric,
  savings_balance numeric,
  available_wallet_balance numeric,
  locked_balance numeric,
  total_received numeric,
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
  successful_payments as (
    select *
    from public.payment_transactions
    where user_id = auth.uid()
      and status = 'successful'
  ),
  successful_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status = 'successful'
  )
  select
    coalesce((select sum(amount) from successful_payments), 0),
    coalesce((select sum(amount) from successful_payments where payment_type in ('wallet_deposit', 'piggy_bag', 'savings', 'personal_susu')), 0),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from public.contributions where user_id = auth.uid() and status::text in ('paid', 'processed')), 0),
    coalesce((select sum(amount) from successful_wallet where transaction_type = 'piggy_bag_deposit'), 0),
    coalesce((select sum(amount) from successful_wallet where transaction_type in ('savings_deposit', 'personal_susu_deposit')), 0),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    coalesce((select sum(amount) from successful_wallet where transaction_type = 'payout_received'), 0),
    coalesce((select currency from wallet), 'GHS');
$$;

notify pgrst, 'reload schema';
