-- 0018_hubtel_phone_verification.sql
-- Makes phone OTP the required gate for protected SikaCircle actions.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'otp_status') then
    create type public.otp_status as enum ('not_started', 'pending', 'verified', 'failed');
  end if;
end $$;

alter table public.user_verifications
  add column if not exists phone_number text,
  add column if not exists otp_status public.otp_status not null default 'not_started',
  add column if not exists otp_reference text,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_code_hash text,
  add column if not exists otp_expires_at timestamptz;

update public.user_verifications
set otp_status = case
    when phone_verified is true then 'verified'::public.otp_status
    when verification_status in ('pending', 'manual_review') then 'pending'::public.otp_status
    else otp_status
  end,
  otp_verified_at = case
    when phone_verified is true then coalesce(user_verifications.otp_verified_at, user_verifications.verified_at, user_verifications.updated_at, now())
    else otp_verified_at
  end,
  phone_number = coalesce(phone_number, p.phone)
from public.profiles p
where p.user_id = user_verifications.user_id;

create or replace function public.user_has_verified_phone(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_verifications uv
    where uv.user_id = check_user_id
      and uv.phone_verified is true
      and uv.otp_status = 'verified'
  );
$$;

create or replace function public.user_passes_circle_onboarding(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and auth.uid() = check_user_id
    and public.user_has_verified_phone(check_user_id);
$$;

drop policy if exists "Contributions: users can insert contributions for themselves" on public.contributions;

create policy "Contributions: users can insert contributions for themselves"
  on public.contributions
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_has_verified_phone(auth.uid())
  );

drop policy if exists "Contributions: users can update their own contribution status" on public.contributions;

create policy "Contributions: users can update their own contribution status"
  on public.contributions
  as permissive
  for update
  using (
    auth.uid() = user_id
    and public.user_has_verified_phone(auth.uid())
  )
  with check (
    auth.uid() = user_id
    and public.user_has_verified_phone(auth.uid())
  );

drop policy if exists "Payouts: circle owners can insert payouts for owned circles" on public.payouts;

create policy "Payouts: circle owners can insert payouts for owned circles"
  on public.payouts
  as permissive
  for insert
  with check (
    public.user_has_verified_phone(auth.uid())
    and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "Payouts: circle owners can update payout records" on public.payouts;

create policy "Payouts: circle owners can update payout records"
  on public.payouts
  as permissive
  for update
  using (
    public.user_has_verified_phone(auth.uid())
    and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  )
  with check (
    public.user_has_verified_phone(auth.uid())
    and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "Transactions: users can insert their own transactions" on public.transactions;

create policy "Transactions: users can insert their own transactions"
  on public.transactions
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_has_verified_phone(auth.uid())
  );
