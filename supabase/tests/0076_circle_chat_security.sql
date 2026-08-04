begin;
select plan(20);

select has_table('public', 'circle_chat_rooms', 'Private Circle chat rooms exist');
select has_table('public', 'circle_chat_members', 'Circle chat access records exist');
select has_table('public', 'circle_chat_messages', 'Circle chat messages exist');
select has_table('public', 'circle_chat_reads', 'Read positions exist');
select has_table('public', 'circle_chat_attachments', 'Controlled attachments exist');
select has_table('public', 'circle_message_reports', 'Message reports exist');
select has_table('public', 'ops_chat_access', 'Case-bound Operations access exists');
select has_table('public', 'circle_chat_case_messages', 'Case evidence links exist');

select has_function(
  'public', 'can_read_circle_chat', array['uuid', 'uuid'],
  'Server-side chat read authorisation exists'
);
select has_function(
  'public', 'can_send_circle_chat', array['uuid', 'uuid'],
  'Server-side chat send authorisation exists'
);
select has_function(
  'public', 'send_circle_chat_message',
  array['uuid', 'text', 'text', 'uuid', 'uuid', 'uuid[]'],
  'Controlled message creation exists'
);
select has_function(
  'public', 'report_circle_chat_message', array['uuid', 'text', 'text'],
  'Controlled reporting exists'
);

select results_eq(
  $$select relrowsecurity from pg_class
    where oid = 'public.circle_chat_messages'::regclass$$,
  array[true],
  'Message RLS is enabled'
);
select results_eq(
  $$select count(*)::bigint from pg_policies
    where schemaname = 'public' and tablename = 'circle_chat_messages'
      and cmd = 'SELECT'$$,
  array[1::bigint],
  'Messages have an authorised read policy'
);
select results_eq(
  $$select count(*)::bigint from pg_policies
    where schemaname = 'public' and tablename = 'circle_chat_messages'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')$$,
  array[0::bigint],
  'Customers cannot bypass controlled message functions'
);
select results_eq(
  $$select count(*)::bigint from pg_policies
    where schemaname = 'public' and tablename = 'ops_chat_access'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')$$,
  array[0::bigint],
  'Operations users cannot grant themselves chat access'
);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_messages
    where message_type = 'system' and sender_user_id is not null$$,
  array[0::bigint],
  'System messages cannot be impersonated'
);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_messages
    where contribution_id is not null
      and not exists (
        select 1 from public.contributions contribution
        where contribution.id = circle_chat_messages.contribution_id
          and contribution.circle_id = circle_chat_messages.circle_id
      )$$,
  array[0::bigint],
  'Contribution threads cannot cross Circle boundaries'
);
select results_eq(
  $$select count(*)::bigint from public.ops_chat_access access
    where access.access_revoked_at is null
      and not exists (
        select 1 from public.governance_requests request
        where request.id = access.governance_request_id
          and request.status in ('pending', 'under_review')
        union all
        select 1 from public.governance_disputes dispute
        where dispute.id = access.dispute_id
          and dispute.status in ('open', 'under_review', 'awaiting_evidence')
      )$$,
  array[0::bigint],
  'Active Operations access always has an active case'
);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_messages
    where evidence_locked and moderation_status <> 'preserved'$$,
  array[0::bigint],
  'Case-linked evidence remains preserved'
);

select * from finish();
rollback;
