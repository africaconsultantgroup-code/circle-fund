-- 0057_include_piggy_origin_payments.sql
-- Counts confirmed Piggy-origin payments as Piggy Savings even if older rows used personal_susu.

drop function if exists public.get_customer_financial_summary();
drop function if exists public.get_customer_payment_breakdown();
drop function if exists public.get_piggy_financial_summary();

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
  currency text,
  susu_contributions numeric,
  savings_toward_susu numeric,
  piggy_savings numeric,
  wallet_deposits numeric,
  expected_payout_total numeric,
  pending_payments numeric,
  failed_payments numeric
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
  normalized_payments as (
    select
      pt.*,
      case
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('piggy_bag', 'piggy', 'piggy_box', 'piggybag')
          or lower(coalesce(pt.provider_response->>'source', '')) like 'piggy%'
          then 'piggy_bag'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('savings', 'saving', 'savings_plan', 'personal_susu', 'personal_susu_deposit')
          then 'savings'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('wallet_deposit', 'deposit')
          then 'wallet_deposit'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('contribution', 'susu_contribution', 'circle_contribution')
          then 'contribution'
        else lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_'))
      end as normalized_payment_type
    from public.payment_transactions pt
    where pt.user_id = auth.uid()
  ),
  normalized_wallet as (
    select
      wt.*,
      case
        when wt.transaction_type = 'piggy_bag_deposit'
          or lower(coalesce(wt.metadata->>'payment_type', '')) in ('piggy_bag', 'piggy', 'piggy box', 'piggy_box', 'piggybag')
          or lower(coalesce(wt.metadata->>'source', '')) like 'piggy%'
          then 'piggy_bag'
        when wt.transaction_type in ('savings_deposit', 'personal_susu_deposit')
          then 'savings'
        when wt.transaction_type = 'contribution_payment'
          then 'contribution'
        when wt.transaction_type = 'deposit'
          then 'wallet_deposit'
        else wt.transaction_type
      end as normalized_payment_type
    from public.wallet_transactions wt
    where wt.user_id = auth.uid()
      and wt.status in ('successful', 'confirmed')
  ),
  confirmed_payments as (
    select *
    from normalized_payments
    where status = 'successful'
  ),
  pending_payment_rows as (
    select *
    from normalized_payments
    where status in ('initiated', 'pending')
  ),
  failed_payment_rows as (
    select *
    from normalized_payments
    where status in ('failed', 'cancelled', 'reversed')
  ),
  expected_payouts as (
    select ps.*
    from public.payout_schedule ps
    join public.circle_members cm on cm.id = ps.member_id
    join public.circles c on c.id = ps.circle_id
    where cm.user_id = auth.uid()
      and cm.status = 'approved'
      and c.status = 'active'
      and ps.status in ('scheduled', 'pending', 'processing')
  ),
  received_legacy as (
    select coalesce(sum(amount), 0) amount
    from public.payouts
    where user_id = auth.uid()
      and status::text in ('completed', 'paid', 'successful')
  )
  select
    coalesce((select sum(amount) from confirmed_payments), 0),
    coalesce((select sum(amount) from confirmed_payments where normalized_payment_type in ('wallet_deposit', 'piggy_bag', 'savings')), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'contribution'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'piggy_bag'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'savings'), 0),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    greatest(
      coalesce((select sum(amount) from normalized_wallet where transaction_type = 'payout_received'), 0),
      coalesce((select amount from received_legacy), 0)
    ),
    coalesce((select currency from wallet), 'GHS'),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'contribution'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'savings'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'piggy_bag'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'wallet_deposit'), 0),
    coalesce((select sum(payout_amount) from expected_payouts), 0),
    coalesce((select sum(amount) from pending_payment_rows), 0),
    coalesce((select sum(amount) from failed_payment_rows), 0);
$$;

create or replace function public.get_customer_payment_breakdown()
returns table (
  payment_type text,
  label text,
  confirmed_amount numeric,
  pending_amount numeric,
  failed_amount numeric,
  confirmed_count integer,
  pending_count integer,
  failed_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  with normalized_payment_rows as (
    select
      pt.*,
      case
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('piggy_bag', 'piggy', 'piggy_box', 'piggybag')
          or lower(coalesce(pt.provider_response->>'source', '')) like 'piggy%'
          then 'piggy_bag'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('savings', 'saving', 'savings_plan', 'personal_susu', 'personal_susu_deposit')
          then 'savings'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('wallet_deposit', 'deposit')
          then 'wallet_deposit'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('contribution', 'susu_contribution', 'circle_contribution')
          then 'contribution'
        else lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_'))
      end as normalized_payment_type
    from public.payment_transactions pt
    where pt.user_id = auth.uid()
  ),
  normalized_wallet as (
    select
      wt.*,
      case
        when wt.transaction_type = 'piggy_bag_deposit'
          or lower(coalesce(wt.metadata->>'payment_type', '')) in ('piggy_bag', 'piggy', 'piggy box', 'piggy_box', 'piggybag')
          or lower(coalesce(wt.metadata->>'source', '')) like 'piggy%'
          then 'piggy_bag'
        when wt.transaction_type in ('savings_deposit', 'personal_susu_deposit')
          then 'savings'
        when wt.transaction_type = 'contribution_payment'
          then 'contribution'
        when wt.transaction_type = 'deposit'
          then 'wallet_deposit'
        else wt.transaction_type
      end as normalized_payment_type
    from public.wallet_transactions wt
    where wt.user_id = auth.uid()
      and wt.status in ('successful', 'confirmed')
  ),
  pending_grouped as (
    select
      normalized_payment_type,
      sum(amount) filter (where status in ('initiated', 'pending')) as pending_amount,
      sum(amount) filter (where status in ('failed', 'cancelled', 'reversed')) as failed_amount,
      count(*) filter (where status in ('initiated', 'pending'))::integer as pending_count,
      count(*) filter (where status in ('failed', 'cancelled', 'reversed'))::integer as failed_count
    from normalized_payment_rows
    group by normalized_payment_type
  ),
  confirmed_grouped as (
    select
      normalized_payment_type,
      sum(amount) as confirmed_amount,
      count(*)::integer as confirmed_count
    from normalized_wallet
    group by normalized_payment_type
  ),
  normalized_types(payment_type, label) as (
    values
      ('contribution', 'Susu Contributions'),
      ('savings', 'Savings Toward Susu'),
      ('piggy_bag', 'Piggy Savings'),
      ('wallet_deposit', 'Wallet Deposits')
  )
  select
    nt.payment_type,
    nt.label,
    coalesce(cg.confirmed_amount, 0),
    coalesce(pg.pending_amount, 0),
    coalesce(pg.failed_amount, 0),
    coalesce(cg.confirmed_count, 0),
    coalesce(pg.pending_count, 0),
    coalesce(pg.failed_count, 0)
  from normalized_types nt
  left join confirmed_grouped cg on cg.normalized_payment_type = nt.payment_type
  left join pending_grouped pg on pg.normalized_payment_type = nt.payment_type
  order by case nt.payment_type
    when 'contribution' then 1
    when 'savings' then 2
    when 'piggy_bag' then 3
    when 'wallet_deposit' then 4
    else 5
  end;
$$;

create or replace function public.get_piggy_financial_summary()
returns table (
  plan_id uuid,
  plan_name text,
  target_amount numeric,
  total_deposited numeric,
  locked_amount numeric,
  progress_percentage numeric,
  payment_count integer,
  last_payment_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with confirmed_plan_payments as (
    select
      case
        when coalesce(
          pt.provider_response->>'planId',
          pt.provider_response->>'plan_id',
          wt.metadata->>'planId',
          wt.metadata->>'plan_id'
        ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then coalesce(
          pt.provider_response->>'planId',
          pt.provider_response->>'plan_id',
          wt.metadata->>'planId',
          wt.metadata->>'plan_id'
        )::uuid
        else null
      end as plan_id,
      wt.amount,
      wt.created_at,
      wt.payment_transaction_id
    from public.wallet_transactions wt
    left join public.payment_transactions pt on pt.id = wt.payment_transaction_id
    where wt.user_id = auth.uid()
      and wt.status in ('successful', 'confirmed')
      and (
        wt.transaction_type = 'piggy_bag_deposit'
        or lower(coalesce(wt.metadata->>'payment_type', '')) in ('piggy_bag', 'piggy', 'piggy box', 'piggy_box', 'piggybag')
        or lower(coalesce(wt.metadata->>'source', '')) like 'piggy%'
      )
  ),
  paid_deposits as (
    select
      deposit.plan_id,
      deposit.amount,
      deposit.deposited_at as created_at,
      deposit.payment_transaction_id
    from public.personal_susu_deposits deposit
    left join public.payment_transactions pt on pt.id = deposit.payment_transaction_id
    where deposit.user_id = auth.uid()
      and deposit.payment_status = 'paid'
      and (
        lower(coalesce(pt.payment_type::text, '')) in ('piggy_bag', 'piggy')
        or lower(coalesce(pt.provider_response->>'source', '')) like 'piggy%'
      )
  ),
  plan_money as (
    select plan_id, amount, created_at from confirmed_plan_payments where plan_id is not null
    union all
    select pd.plan_id, pd.amount, pd.created_at
    from paid_deposits pd
    where not exists (
      select 1
      from confirmed_plan_payments cpp
      where cpp.payment_transaction_id = pd.payment_transaction_id
    )
  )
  select
    plan.id,
    plan.name,
    plan.target_amount,
    coalesce(sum(plan_money.amount), 0),
    case
      when plan.locked_until >= current_date then coalesce(sum(plan_money.amount), 0)
      else 0
    end,
    case
      when plan.target_amount > 0 then least(round((coalesce(sum(plan_money.amount), 0) / plan.target_amount) * 100, 2), 100)
      else 0
    end,
    count(plan_money.amount)::integer,
    max(plan_money.created_at)
  from public.personal_susu_plans plan
  left join plan_money on plan_money.plan_id = plan.id
  where plan.user_id = auth.uid()
  group by plan.id, plan.name, plan.target_amount, plan.locked_until
  order by plan.created_at desc;
$$;

notify pgrst, 'reload schema';
