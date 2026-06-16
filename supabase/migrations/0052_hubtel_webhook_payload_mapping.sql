-- 0052_hubtel_webhook_payload_mapping.sql
-- Handles Hubtel callback payload variants and maps successful confirmations to accounting.

create or replace function public.record_hubtel_payment_webhook(payload jsonb)
returns public.payment_webhook_events
language plpgsql
security definer
set search_path = public
as $$
declare
  reference text;
  incoming_status text;
  response_code text;
  target_transaction public.payment_transactions;
  webhook_event public.payment_webhook_events;
  was_already_successful boolean := false;
begin
  reference := coalesce(
    payload->>'provider_reference',
    payload->>'ClientReference',
    payload->>'clientReference',
    payload->>'client_reference',
    payload->'Data'->>'ClientReference',
    payload->'Data'->>'clientReference',
    payload->'data'->>'ClientReference',
    payload->'data'->>'clientReference',
    payload->'Transaction'->>'ClientReference',
    payload->'transaction'->>'clientReference',
    payload->>'CheckoutId',
    payload->>'checkoutId',
    payload->>'TransactionId',
    payload->>'transactionId'
  );

  incoming_status := lower(coalesce(
    payload->>'status',
    payload->>'Status',
    payload->>'paymentStatus',
    payload->>'PaymentStatus',
    payload->'Data'->>'Status',
    payload->'Data'->>'status',
    payload->'data'->>'Status',
    payload->'data'->>'status',
    payload->'Transaction'->>'Status',
    payload->'transaction'->>'status',
    payload->>'ResponseCode',
    payload->>'responseCode',
    payload->'Data'->>'ResponseCode',
    payload->'data'->>'responseCode',
    'received'
  ));

  response_code := coalesce(
    payload->>'ResponseCode',
    payload->>'responseCode',
    payload->'Data'->>'ResponseCode',
    payload->'Data'->>'responseCode',
    payload->'data'->>'ResponseCode',
    payload->'data'->>'responseCode'
  );

  insert into public.payment_webhook_events (provider, provider_reference, event_type, payload, processing_status)
  values ('hubtel', reference, coalesce(payload->>'event', payload->>'EventType', payload->>'eventType', 'payment_callback'), payload, 'received')
  returning * into webhook_event;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    null,
    'payment_webhook_received',
    'payment_webhook_event',
    webhook_event.id,
    'Hubtel payment webhook received.',
    jsonb_build_object('provider_reference', reference, 'status', incoming_status, 'response_code', response_code)
  );

  if reference is null then
    update public.payment_webhook_events
    set processing_status = 'failed',
        processing_error = 'Missing provider reference',
        processed_at = now()
    where id = webhook_event.id
    returning * into webhook_event;

    return webhook_event;
  end if;

  select *
  into target_transaction
  from public.payment_transactions
  where provider = 'hubtel'
    and (
      provider_reference = reference
      or provider_response->'hubtel_response'->'data'->>'checkoutId' = reference
      or provider_response->'hubtel_response'->'data'->>'checkoutID' = reference
      or provider_response->>'checkout_id' = reference
    )
  order by created_at desc
  limit 1;

  if target_transaction.id is null then
    update public.payment_webhook_events
    set processing_status = 'failed',
        processing_error = 'No matching payment transaction',
        processed_at = now()
    where id = webhook_event.id
    returning * into webhook_event;

    return webhook_event;
  end if;

  was_already_successful := target_transaction.status = 'successful';

  if incoming_status in ('successful', 'success', 'paid', 'completed', 'complete', '0000')
    or response_code = '0000'
  then
    update public.payment_transactions
    set status = 'successful',
        provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object('hubtel_callback', payload),
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

    if not was_already_successful then
      insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
      values (
        null,
        'payment_success',
        'payment_transaction',
        target_transaction.id,
        'Hubtel webhook confirmed payment successful.',
        jsonb_build_object(
          'provider_reference', target_transaction.provider_reference,
          'webhook_reference', reference,
          'payment_type', target_transaction.payment_type,
          'contribution_id', target_transaction.contribution_id
        )
      );
    end if;
  elsif incoming_status in ('failed', 'failure', 'cancelled', 'canceled', 'reversed', 'declined') then
    update public.payment_transactions
    set status = case
          when incoming_status = 'reversed' then 'reversed'
          when incoming_status in ('cancelled', 'canceled') then 'cancelled'
          else 'failed'
        end,
        provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object('hubtel_callback', payload),
        updated_at = now()
    where id = target_transaction.id;

    update public.contribution_payments
    set status = case
          when incoming_status = 'reversed' then 'reversed'
          when incoming_status in ('cancelled', 'canceled') then 'cancelled'
          else 'failed'
        end,
        updated_at = now()
    where payment_transaction_id = target_transaction.id;

    update public.contributions
    set status = case when incoming_status in ('failed', 'failure', 'declined') then 'failed'::public.contribution_status else status end,
        updated_at = now()
    where id = target_transaction.contribution_id;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      null,
      'payment_failed',
      'payment_transaction',
      target_transaction.id,
      'Hubtel webhook marked payment failed.',
      jsonb_build_object('provider_reference', target_transaction.provider_reference, 'webhook_reference', reference, 'payment_type', target_transaction.payment_type)
    );
  end if;

  update public.payment_webhook_events
  set processing_status = 'processed',
      processed_at = now()
  where id = webhook_event.id
  returning * into webhook_event;

  return webhook_event;
end;
$$;

notify pgrst, 'reload schema';
