-- Evidence-based reconciliation of the three Protection backfill exceptions.
-- Two Circle payments have one provable payout position. The Piggy payment has
-- no plan/deposit match and intentionally remains open for manual follow-up.

create or replace function public.resolve_circle_protection_terms(
  check_circle_id uuid,
  check_contribution_id uuid,
  out resolved_beneficiary uuid,
  out resolved_maturity date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution_due date;
  matching_schedule_count integer;
begin
  select c.due_date::date
  into contribution_due
  from public.contributions c
  where c.id = check_contribution_id
    and c.circle_id = check_circle_id;

  if contribution_due is null then
    return;
  end if;

  select count(*)
  into matching_schedule_count
  from public.payout_schedule ps
  join public.circle_members cm on cm.id = ps.member_id
  where ps.circle_id = check_circle_id
    and ps.payout_due_date::date = contribution_due
    and (
      ps.locked_at is not null
      or public.circle_rotation_is_locked(check_circle_id)
    );

  if matching_schedule_count <> 1 then
    return;
  end if;

  select cm.user_id, ps.payout_due_date::date
  into resolved_beneficiary, resolved_maturity
  from public.payout_schedule ps
  join public.circle_members cm on cm.id = ps.member_id
  where ps.circle_id = check_circle_id
    and ps.payout_due_date::date = contribution_due
    and (
      ps.locked_at is not null
      or public.circle_rotation_is_locked(check_circle_id)
    );
end;
$$;

revoke all on function public.resolve_circle_protection_terms(uuid, uuid)
  from public, anon, authenticated;

do $$
declare
  queue_record public.protection_reconciliation_queue;
  created_fund public.protected_fund_ledger;
  evidence jsonb;
begin
  for queue_record in
    select q.*
    from public.protection_reconciliation_queue q
    where q.source_payment_transaction_id in (
      '67d06a2d-29e0-4c9f-bd85-65773dd6b9ad'::uuid,
      'edc437cf-db4a-4abe-b99e-0f0d98e63733'::uuid
    )
      and q.issue_type = 'missing_payout_schedule'
      and q.status in ('open', 'investigating')
    for update
  loop
    select pf.*
    into created_fund
    from public.protect_successful_payment(
      queue_record.source_payment_transaction_id
    ) as pf;

    if created_fund.id is null
      or created_fund.fund_type <> 'circle'
      or created_fund.beneficiary_user_id is null
      or created_fund.maturity_date is null
    then
      raise exception 'Conclusive Circle protection could not be created for queue record %',
        queue_record.id;
    end if;

    evidence := jsonb_build_object(
      'investigation_result', 'CLEAR_MATCH',
      'evidence_reviewed', jsonb_build_array(
        'payment_transaction',
        'provider_callback',
        'contribution',
        'circle_membership',
        'circle_creation_audit',
        'payout_rotation_audit',
        'unique_due_date_schedule_match',
        'wallet_accounting_entry'
      ),
      'reconciliation_reason',
        'One immutable payout position matches the contribution due date.',
      'protected_fund_id', created_fund.id,
      'beneficiary_user_id', created_fund.beneficiary_user_id,
      'maturity_date', created_fund.maturity_date,
      'amount', created_fund.amount
    );

    update public.protection_reconciliation_queue q
    set status = 'resolved',
        details = q.details || evidence,
        resolved_at = now(),
        resolved_by = null,
        resolution_notes =
          'System reconciliation: unique audited payout position proven from existing records.'
    where q.id = queue_record.id;

    insert into public.audit_logs (
      staff_user_id, action, target_type, target_id, notes, metadata
    )
    values (
      null,
      'protection_reconciliation_resolved',
      'protection_reconciliation_queue',
      queue_record.id,
      'Circle protection created from a unique audited payout schedule match.',
      evidence || jsonb_build_object(
        'source_payment_transaction_id', queue_record.source_payment_transaction_id,
        'actor', 'migration_0068'
      )
    );
  end loop;

  update public.protection_reconciliation_queue q
  set details = q.details || jsonb_build_object(
        'investigation_result', 'NO_MATCH',
        'evidence_reviewed', jsonb_build_array(
          'payment_transaction',
          'provider_callback',
          'payment_metadata',
          'personal_susu_plans',
          'personal_susu_deposits',
          'wallet_transactions',
          'nearby_payment_attempts',
          'audit_logs'
        ),
        'reason_unresolved',
          'No Piggy plan or deposit exists for the user and the payment has no plan identifier.',
        'recommended_manual_follow_up',
          'Confirm refund/test disposition with Hubtel; do not attach to a Piggy Bag without new conclusive evidence.'
      ),
      resolution_notes =
        'Investigated: NO_MATCH. Left open because no Piggy destination can be proven.'
  where q.source_payment_transaction_id =
      '8a37fed5-96db-45ba-8e60-9d29cc216bb1'::uuid
    and q.issue_type = 'ambiguous_piggy_payment'
    and q.status in ('open', 'investigating');
end;
$$;

notify pgrst, 'reload schema';
