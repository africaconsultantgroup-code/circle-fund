-- 0055_customer_financial_visibility.sql
-- Customer-facing financial visibility, with pending payments separated from confirmed balances.

drop function if exists public.get_customer_financial_summary();
drop function if exists public.get_customer_payment_breakdown();
drop function if exists public.get_customer_received_summary();
drop function if exists public.get_circle_member_financial_summary(uuid);

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
  confirmed_payments as (
    select *
    from public.payment_transactions
    where user_id = auth.uid()
      and status = 'successful'
  ),
  pending_payment_rows as (
    select *
    from public.payment_transactions
    where user_id = auth.uid()
      and status in ('initiated', 'pending')
  ),
  failed_payment_rows as (
    select *
    from public.payment_transactions
    where user_id = auth.uid()
      and status in ('failed', 'cancelled', 'reversed')
  ),
  confirmed_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status in ('successful', 'confirmed')
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
  received_wallet as (
    select coalesce(sum(amount), 0) amount
    from confirmed_wallet
    where transaction_type = 'payout_received'
  ),
  received_legacy as (
    select coalesce(sum(amount), 0) amount
    from public.payouts
    where user_id = auth.uid()
      and status::text in ('completed', 'paid', 'successful')
  )
  select
    coalesce((select sum(amount) from confirmed_payments), 0),
    coalesce((select sum(amount) from confirmed_payments where payment_type in ('wallet_deposit', 'piggy_bag', 'savings', 'personal_susu')), 0),
    coalesce((select sum(amount) from confirmed_payments where payment_type = 'contribution'), 0),
    coalesce((select sum(amount) from confirmed_wallet where transaction_type = 'piggy_bag_deposit'), 0),
    coalesce((select sum(amount) from confirmed_wallet where transaction_type in ('savings_deposit', 'personal_susu_deposit')), 0),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    greatest(coalesce((select amount from received_wallet), 0), coalesce((select amount from received_legacy), 0)),
    coalesce((select currency from wallet), 'GHS'),
    coalesce((select sum(amount) from confirmed_payments where payment_type = 'contribution'), 0),
    coalesce((select sum(amount) from confirmed_payments where payment_type in ('savings', 'personal_susu')), 0),
    coalesce((select sum(amount) from confirmed_payments where payment_type = 'piggy_bag'), 0),
    coalesce((select sum(amount) from confirmed_payments where payment_type = 'wallet_deposit'), 0),
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
  with types(payment_type, label) as (
    values
      ('contribution', 'Susu Contributions'),
      ('savings', 'Savings Toward Susu'),
      ('personal_susu', 'Savings Toward Susu'),
      ('piggy_bag', 'Piggy Savings'),
      ('wallet_deposit', 'Wallet Deposits')
  ),
  grouped as (
    select
      case when pt.payment_type in ('savings', 'personal_susu') then 'savings' else pt.payment_type::text end as grouped_type,
      sum(pt.amount) filter (where pt.status = 'successful') as confirmed_amount,
      sum(pt.amount) filter (where pt.status in ('initiated', 'pending')) as pending_amount,
      sum(pt.amount) filter (where pt.status in ('failed', 'cancelled', 'reversed')) as failed_amount,
      count(*) filter (where pt.status = 'successful')::integer as confirmed_count,
      count(*) filter (where pt.status in ('initiated', 'pending'))::integer as pending_count,
      count(*) filter (where pt.status in ('failed', 'cancelled', 'reversed'))::integer as failed_count
    from public.payment_transactions pt
    where pt.user_id = auth.uid()
    group by 1
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
    coalesce(g.confirmed_amount, 0),
    coalesce(g.pending_amount, 0),
    coalesce(g.failed_amount, 0),
    coalesce(g.confirmed_count, 0),
    coalesce(g.pending_count, 0),
    coalesce(g.failed_count, 0)
  from normalized_types nt
  left join grouped g on g.grouped_type = nt.payment_type
  order by case nt.payment_type
    when 'contribution' then 1
    when 'savings' then 2
    when 'piggy_bag' then 3
    when 'wallet_deposit' then 4
    else 5
  end;
$$;

create or replace function public.get_customer_received_summary()
returns table (
  total_received numeric,
  expected_payout_total numeric,
  next_expected_payout_amount numeric,
  next_expected_payout_date timestamptz,
  active_group_count integer,
  currency text
)
language sql
security definer
set search_path = public
stable
as $$
  with confirmed_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status in ('successful', 'confirmed')
  ),
  expected_payouts as (
    select ps.*, c.base_currency
    from public.payout_schedule ps
    join public.circle_members cm on cm.id = ps.member_id
    join public.circles c on c.id = ps.circle_id
    where cm.user_id = auth.uid()
      and cm.status = 'approved'
      and c.status = 'active'
      and ps.status in ('scheduled', 'pending', 'processing')
  ),
  next_payout as (
    select *
    from expected_payouts
    order by payout_due_date asc nulls last
    limit 1
  )
  select
    coalesce((select sum(amount) from confirmed_wallet where transaction_type = 'payout_received'), 0),
    coalesce((select sum(payout_amount) from expected_payouts), 0),
    coalesce((select payout_amount from next_payout), 0),
    (select payout_due_date from next_payout),
    coalesce((select count(distinct circle_id)::integer from expected_payouts), 0),
    coalesce((select base_currency from next_payout), 'GHS');
$$;

create or replace function public.get_circle_member_financial_summary(check_circle_id uuid)
returns table (
  circle_id uuid,
  user_id uuid,
  susu_contributions_paid numeric,
  contribution_pending numeric,
  contribution_overdue numeric,
  contribution_failed numeric,
  confirmed_payments numeric,
  pending_payments numeric,
  failed_payments numeric,
  total_received numeric,
  expected_payout numeric,
  expected_payout_date timestamptz,
  receipt_count integer,
  currency text
)
language sql
security definer
set search_path = public
stable
as $$
  with membership as (
    select *
    from public.circle_members
    where circle_id = check_circle_id
      and user_id = auth.uid()
      and status = 'approved'
    limit 1
  ),
  circle_row as (
    select *
    from public.circles
    where id = check_circle_id
      and (
        owner_id = auth.uid()
        or exists (select 1 from membership)
      )
    limit 1
  ),
  member_contributions as (
    select *
    from public.contributions
    where circle_id = check_circle_id
      and user_id = auth.uid()
  ),
  member_payments as (
    select *
    from public.payment_transactions
    where circle_id = check_circle_id
      and user_id = auth.uid()
  ),
  member_wallet as (
    select *
    from public.wallet_transactions
    where circle_id = check_circle_id
      and user_id = auth.uid()
      and status in ('successful', 'confirmed')
  ),
  my_payout as (
    select ps.*
    from public.payout_schedule ps
    join public.circle_members cm on cm.id = ps.member_id
    where ps.circle_id = check_circle_id
      and cm.user_id = auth.uid()
    order by ps.payout_due_date asc nulls last
    limit 1
  )
  select
    check_circle_id,
    auth.uid(),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from member_contributions where status::text in ('paid', 'processed')), 0),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from member_contributions where status::text in ('pending', 'unpaid')), 0),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from member_contributions where status::text in ('late', 'overdue')), 0),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from member_contributions where status::text = 'failed'), 0),
    coalesce((select sum(amount) from member_payments where status = 'successful'), 0),
    coalesce((select sum(amount) from member_payments where status in ('initiated', 'pending')), 0),
    coalesce((select sum(amount) from member_payments where status in ('failed', 'cancelled', 'reversed')), 0),
    coalesce((select sum(amount) from member_wallet where transaction_type = 'payout_received'), 0),
    coalesce((select payout_amount from my_payout), 0),
    (select payout_due_date from my_payout),
    coalesce((select count(*)::integer from member_wallet where receipt_id is not null), 0),
    coalesce((select base_currency from circle_row), 'GHS')
  where exists (select 1 from circle_row);
$$;

create or replace function public.get_customer_payment_history()
returns table (
  transaction_id uuid,
  wallet_transaction_id uuid,
  payment_type text,
  service_type text,
  amount numeric,
  currency text,
  status text,
  provider text,
  provider_reference text,
  receipt_id text,
  payment_method text,
  created_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    pt.id,
    wt.id,
    pt.payment_type,
    case pt.payment_type
      when 'contribution' then 'Circle contribution'
      when 'piggy_bag' then 'Piggy Bag'
      when 'savings' then 'Savings plan'
      when 'personal_susu' then 'Personal Susu'
      when 'wallet_deposit' then 'Wallet deposit'
      else initcap(replace(pt.payment_type, '_', ' '))
    end,
    pt.amount,
    pt.currency,
    case when pt.status = 'successful' then 'paid' else pt.status end,
    pt.provider,
    pt.provider_reference,
    wt.receipt_id,
    pt.payment_method,
    pt.created_at,
    case when pt.status = 'successful' then pt.updated_at else null end
  from public.payment_transactions pt
  left join public.wallet_transactions wt on wt.payment_transaction_id = pt.id and wt.status in ('successful', 'confirmed')
  where pt.user_id = auth.uid()
  order by pt.created_at desc;
$$;

notify pgrst, 'reload schema';
