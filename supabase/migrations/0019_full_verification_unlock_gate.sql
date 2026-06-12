-- 0019_full_verification_unlock_gate.sql
-- Unlock protected SikaCircle actions only after the user has completed the
-- customer verification forms. Ghana Card and face submissions may still be
-- pending/manual_review until live providers or admin approval finalize them.

create or replace function public.user_passes_circle_onboarding(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and auth.uid() = check_user_id
    and exists (
      select 1
      from public.profiles p
      join public.user_verifications uv on uv.user_id = p.user_id
      where p.user_id = check_user_id
        and p.profile_completed is true
        and p.account_status = 'active'
        and uv.phone_verified is true
        and uv.otp_status = 'verified'
        and (
          uv.ghana_card_verified is true
          or (
            nullif(trim(coalesce(uv.ghana_card_number_hash, '')), '') is not null
            and coalesce(uv.ghana_card_status, uv.verification_status) in ('pending', 'manual_review', 'verified')
          )
        )
        and (
          uv.face_verified is true
          or (
            uv.selfie_uploaded is true
            and coalesce(uv.face_status, uv.verification_status) in ('pending', 'manual_review', 'verified')
          )
        )
    );
$$;

drop policy if exists "Contributions: users can insert contributions for themselves" on public.contributions;

create policy "Contributions: users can insert contributions for themselves"
  on public.contributions
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_passes_circle_onboarding(auth.uid())
  );

drop policy if exists "Contributions: users can update their own contribution status" on public.contributions;

create policy "Contributions: users can update their own contribution status"
  on public.contributions
  as permissive
  for update
  using (
    auth.uid() = user_id
    and public.user_passes_circle_onboarding(auth.uid())
  )
  with check (
    auth.uid() = user_id
    and public.user_passes_circle_onboarding(auth.uid())
  );

drop policy if exists "Payouts: circle owners can insert payouts for owned circles" on public.payouts;

create policy "Payouts: circle owners can insert payouts for owned circles"
  on public.payouts
  as permissive
  for insert
  with check (
    public.user_passes_circle_onboarding(auth.uid())
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
    public.user_passes_circle_onboarding(auth.uid())
    and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  )
  with check (
    public.user_passes_circle_onboarding(auth.uid())
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
    and public.user_passes_circle_onboarding(auth.uid())
  );
