begin;
select plan(11);

insert into auth.users(id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'chat-a@example.test', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'chat-b@example.test', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'chat-pending@example.test', now(), now());

insert into public.circles(id, owner_id, name, invite_token, circle_type)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Circle A', 'CHAT-A', 'rotational'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Circle B', 'CHAT-B', 'rotational');

insert into public.circle_members(id, circle_id, user_id, role, status)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001', 'creator', 'approved'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002', 'creator', 'approved'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003', 'member', 'pending');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select results_eq(
  $$select count(*)::bigint from public.circle_chat_rooms$$,
  array[1::bigint],
  'Approved member sees only their own Circle room'
);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_rooms
    where circle_id = '20000000-0000-0000-0000-000000000002'$$,
  array[0::bigint],
  'Cross-Circle room access is blocked by RLS'
);
select lives_ok(
  $$select public.send_circle_chat_message(
    (select id from public.circle_chat_rooms
      where circle_id = '20000000-0000-0000-0000-000000000001'),
    'Authorised member message'
  )$$,
  'Approved member can send an ordinary message'
);
select throws_ok(
  $$select public.send_circle_chat_message(
    (select id from public.circle_chat_rooms
      where circle_id = '20000000-0000-0000-0000-000000000002'),
    'Cross-Circle attempt'
  )$$,
  'P0001',
  'Active Circle chat access is required',
  'Member cannot send to another Circle'
);
select throws_ok(
  $$select public.send_circle_chat_message(
    (select id from public.circle_chat_rooms
      where circle_id = '20000000-0000-0000-0000-000000000001'),
    'Fake authoritative message',
    'system'
  )$$,
  'P0001',
  'Customers cannot create this message type',
  'Customer cannot create a fake system message'
);
select throws_ok(
  $$insert into public.circle_chat_messages(
    room_id, circle_id, sender_user_id, message_type, body
  ) values (
    (select id from public.circle_chat_rooms
      where circle_id = '20000000-0000-0000-0000-000000000001'),
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'text', 'Direct insert bypass'
  )$$,
  '42501',
  null,
  'Direct message insert is blocked'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_rooms$$,
  array[0::bigint],
  'Invited but unapproved member cannot read chat'
);
select throws_ok(
  $$select public.send_circle_chat_message(
    (select id from public.circle_chat_rooms
      where circle_id = '20000000-0000-0000-0000-000000000001'),
    'Pending member attempt'
  )$$,
  'P0001',
  'Active Circle chat access is required',
  'Invited but unapproved member cannot send'
);

reset role;
update public.circles set status = 'archived'
where id = '20000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.send_circle_chat_message(
    (select id from public.circle_chat_rooms
      where circle_id = '20000000-0000-0000-0000-000000000002'),
    'Archived Circle attempt'
  )$$,
  'P0001',
  'Active Circle chat access is required',
  'Archived Circle chat is read-only'
);

reset role;
update public.circle_members set status = 'removed'
where id = '30000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_rooms$$,
  array[0::bigint],
  'Removed member loses normal chat access'
);
select results_eq(
  $$select count(*)::bigint from public.circle_chat_messages$$,
  array[0::bigint],
  'Removed member cannot read normal historical chat'
);

reset role;
select * from finish();
rollback;
