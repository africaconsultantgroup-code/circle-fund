-- 0053_admin_hubtel_payment_reconciliation.sql
-- Allows finance/super_admin staff to reconcile a Hubtel payment when a customer was debited but callback did not arrive.

create or replace function public.admin_reconcile_hubtel_payment(
  check_provider_reference text,
  reconciliation_notes text default null
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_profile public.profiles;
  target_transaction public.payment_transactions;
  was_already_successful boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into staff_profile
  from public.profiles
  where user_id = auth.uid();

  if staff_profile.user_id is null
    or staff_profile.account_status <> 'active'
    or staff_profile.role not in ('super_admin', 'finance')
  then
    raise exception 'Finance or Super Admin access required';
  end if;

  if nullif(trim(check_provider_reference), '') is null then
    raise exception 'Provider reference is required';
  end if;

  select *
  into target_transaction
  from public.payment_transactions
  where provider = 'hubtel'
    and provider_reference = trim(check_provider_reference)
  order by created_at desc
  limit 1
  for update;

  if target_transaction.id is null then
    raise exception 'Payment transaction not found for provider reference %', check_provider_reference;
  end if;

  if target_transaction.status in ('failed', 'cancelled', 'reversed') then
    raise exception 'Cannot reconcile a % payment without creating a new verified provider record', target_transaction.status;
  end if;

  was_already_successful := target_transaction.status = 'successful';

  update public.payment_transactions
  set status = 'successful',
      provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object(
        'manual_reconciliation', jsonb_build_object(
          'reconciled_by', auth.uid(),
          'reconciled_at', now(),
          'notes', reconciliation_notes,
          'reason', 'Customer debited but Hubtel callback did not arrive'
        )
      ),
      updated_at = now()
  where id = target_transaction.id
  returning * into target_transaction;

  perform public.account_successful_payment(target_transaction);

  update public.contribution_payments
  set status = 'successful',
      updated_at = now()
  where payment_transaction_id = target_transaction.id;

  if target_transaction.contribution_id is not null then
    update public.contributions
    set status = 'paid',
        paid_at = coalesce(paid_at, now()),
        payment_reference = target_transaction.provider_reference,
        updated_at = now()
    where id = target_transaction.contribution_id;
  end if;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    case when was_already_successful then 'payment_reconciliation_checked' else 'payment_reconciled_success' end,
    'payment_transaction',
    target_transaction.id,
    coalesce(nullif(trim(reconciliation_notes), ''), 'Manual Hubtel reconciliation completed by finance staff.'),
    jsonb_build_object(
      'provider_reference', target_transaction.provider_reference,
      'payment_type', target_transaction.payment_type,
      'previously_successful', was_already_successful,
      'reconciled_by_role', staff_profile.role
    )
  );

  return target_transaction;
end;
$$;

notify pgrst, 'reload schema';
