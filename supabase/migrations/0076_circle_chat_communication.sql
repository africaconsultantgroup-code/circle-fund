-- 0076_circle_chat_communication.sql
-- Private Circle communication. This migration is intentionally non-financial:
-- it references authoritative records but never changes payment, wallet, protection,
-- contribution, payout schedule, payout release, or reconciliation state.

create table public.circle_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null unique references public.circles(id) on delete restrict,
  circle_type text not null check (circle_type in ('rotational', 'goal')),
  status text not null default 'active' check (status in ('active', 'read_only', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.circle_chat_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.circle_chat_rooms(id) on delete restrict,
  circle_membership_id uuid not null unique references public.circle_members(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  access_status text not null default 'active'
    check (access_status in ('active', 'read_only', 'suspended', 'revoked')),
  ordinary_notifications_muted boolean not null default false,
  joined_at timestamptz not null default now(),
  access_changed_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table public.ops_chat_access (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.circle_chat_rooms(id) on delete restrict,
  ops_user_id uuid not null references auth.users(id) on delete restrict,
  governance_request_id uuid references public.governance_requests(id) on delete restrict,
  dispute_id uuid references public.governance_disputes(id) on delete restrict,
  access_reason text not null,
  access_granted_by uuid not null references auth.users(id) on delete restrict,
  access_granted_at timestamptz not null default now(),
  access_revoked_at timestamptz,
  check ((governance_request_id is not null)::integer + (dispute_id is not null)::integer = 1)
);

create unique index ops_chat_access_active_case_idx
  on public.ops_chat_access (
    room_id, ops_user_id,
    coalesce(governance_request_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(dispute_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where access_revoked_at is null;

create table public.circle_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.circle_chat_rooms(id) on delete restrict,
  circle_id uuid not null references public.circles(id) on delete restrict,
  sender_user_id uuid references auth.users(id) on delete restrict,
  message_type text not null default 'text' check (message_type in (
    'text', 'system', 'contribution_thread', 'governance_event', 'attachment', 'announcement'
  )),
  body text not null check (char_length(body) between 1 and 4000),
  reply_to_message_id uuid references public.circle_chat_messages(id) on delete restrict,
  contribution_id uuid references public.contributions(id) on delete restrict,
  governance_event_id uuid references public.governance_events(id) on delete restrict,
  governance_request_id uuid references public.governance_requests(id) on delete restrict,
  dispute_id uuid references public.governance_disputes(id) on delete restrict,
  mentioned_user_ids uuid[] not null default '{}'::uuid[],
  event_key text unique,
  edited_at timestamptz,
  edit_count integer not null default 0 check (edit_count >= 0),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  deletion_reason text,
  moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'reported', 'under_review', 'hidden', 'preserved')),
  evidence_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (message_type in ('system', 'governance_event') and sender_user_id is null)
    or (message_type not in ('system', 'governance_event') and sender_user_id is not null)
  ),
  check (message_type <> 'contribution_thread' or contribution_id is not null),
  check (message_type <> 'governance_event'
    or governance_event_id is not null
    or governance_request_id is not null
    or dispute_id is not null)
);

create table public.circle_chat_message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.circle_chat_messages(id) on delete restrict,
  previous_body text not null,
  edited_by uuid not null references auth.users(id) on delete restrict,
  edited_at timestamptz not null default now()
);

create table public.circle_chat_reads (
  room_id uuid not null references public.circle_chat_rooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  last_read_message_id uuid references public.circle_chat_messages(id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.circle_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.circle_chat_messages(id) on delete restrict,
  room_id uuid not null references public.circle_chat_rooms(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_bucket text not null default 'circle-chat-attachments',
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  attachment_purpose text not null default 'general'
    check (attachment_purpose in ('general', 'payment_evidence', 'governance_evidence')),
  scan_status text not null default 'pending'
    check (scan_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.circle_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.circle_chat_messages(id) on delete restrict,
  reported_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (reason in (
    'abuse', 'threats', 'fraud', 'impersonation', 'harassment',
    'misleading_payment_claim', 'prohibited_content'
  )),
  details text,
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  unique (message_id, reported_by)
);

create table public.circle_chat_case_messages (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.circle_chat_messages(id) on delete restrict,
  governance_request_id uuid references public.governance_requests(id) on delete restrict,
  dispute_id uuid references public.governance_disputes(id) on delete restrict,
  attached_by uuid not null references auth.users(id) on delete restrict,
  attached_at timestamptz not null default now(),
  check ((governance_request_id is not null)::integer + (dispute_id is not null)::integer = 1)
);

create unique index circle_chat_case_message_request_idx
  on public.circle_chat_case_messages(message_id, governance_request_id)
  where governance_request_id is not null;
create unique index circle_chat_case_message_dispute_idx
  on public.circle_chat_case_messages(message_id, dispute_id)
  where dispute_id is not null;
create index circle_chat_messages_room_created_idx
  on public.circle_chat_messages(room_id, created_at desc);
create index circle_chat_messages_contribution_idx
  on public.circle_chat_messages(contribution_id, created_at)
  where contribution_id is not null;
create index circle_chat_messages_governance_idx
  on public.circle_chat_messages(governance_request_id, dispute_id, created_at)
  where governance_request_id is not null or dispute_id is not null;
create index circle_message_reports_status_idx
  on public.circle_message_reports(status, created_at desc);
create index circle_chat_reads_user_idx on public.circle_chat_reads(user_id, last_read_at);

alter table public.circle_chat_rooms enable row level security;
alter table public.circle_chat_members enable row level security;
alter table public.circle_chat_messages enable row level security;
alter table public.circle_chat_message_edits enable row level security;
alter table public.circle_chat_reads enable row level security;
alter table public.circle_chat_attachments enable row level security;
alter table public.circle_message_reports enable row level security;
alter table public.ops_chat_access enable row level security;
alter table public.circle_chat_case_messages enable row level security;

create or replace function public.can_read_circle_chat(check_room_id uuid, check_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.circle_chat_rooms room
    join public.circle_chat_members member on member.room_id = room.id
    where room.id = check_room_id and member.user_id = check_user_id
      and member.access_status in ('active', 'read_only')
  ) or exists (
    select 1 from public.ops_chat_access access
    join public.circle_chat_rooms room on room.id = access.room_id
    left join public.governance_requests request on request.id = access.governance_request_id
    left join public.governance_disputes dispute on dispute.id = access.dispute_id
    where access.room_id = check_room_id and access.ops_user_id = check_user_id
      and access.access_revoked_at is null
      and (
        request.status in ('pending', 'under_review')
        or dispute.status in ('open', 'under_review', 'awaiting_evidence')
      )
  )
$$;

create or replace function public.can_send_circle_chat(check_room_id uuid, check_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.circle_chat_rooms room
    join public.circles circle_record on circle_record.id = room.circle_id
    join public.circle_chat_members member on member.room_id = room.id
    where room.id = check_room_id and member.user_id = check_user_id
      and member.access_status = 'active'
      and room.status = 'active'
      and circle_record.status::text not in ('archived', 'completed', 'cancelled')
  ) or exists (
    select 1 from public.ops_chat_access access
    left join public.governance_requests request on request.id = access.governance_request_id
    left join public.governance_disputes dispute on dispute.id = access.dispute_id
    where access.room_id = check_room_id and access.ops_user_id = check_user_id
      and access.access_revoked_at is null
      and (
        request.status in ('pending', 'under_review')
        or dispute.status in ('open', 'under_review', 'awaiting_evidence')
      )
  )
$$;

create policy "Authorised users read chat rooms" on public.circle_chat_rooms for select
  using (public.can_read_circle_chat(id, auth.uid()));
create policy "Members read own chat access" on public.circle_chat_members for select
  using (user_id = auth.uid() or public.is_circle_admin(
    (select room.circle_id from public.circle_chat_rooms room where room.id = room_id), auth.uid()
  ));
create policy "Authorised users read messages" on public.circle_chat_messages for select
  using (public.can_read_circle_chat(room_id, auth.uid()));
create policy "Staff read retained message edits" on public.circle_chat_message_edits for select
  using (public.current_user_staff_role() is not null);
create policy "Users manage own read position" on public.circle_chat_reads for all
  using (user_id = auth.uid() and public.can_read_circle_chat(room_id, auth.uid()))
  with check (user_id = auth.uid() and public.can_read_circle_chat(room_id, auth.uid()));
create policy "Authorised users read approved attachments" on public.circle_chat_attachments for select
  using (scan_status = 'approved' and public.can_read_circle_chat(room_id, auth.uid()));
create policy "Users read own reports" on public.circle_message_reports for select
  using (reported_by = auth.uid() or public.current_user_staff_role() is not null);
create policy "Staff read ops chat access" on public.ops_chat_access for select
  using (ops_user_id = auth.uid() or public.current_user_staff_role() is not null);
create policy "Case participants read linked messages" on public.circle_chat_case_messages for select
  using (
    exists (
      select 1 from public.governance_requests request
      where request.id = governance_request_id and (
        request.requested_by = auth.uid() or request.subject_user_id = auth.uid()
        or public.is_circle_admin(request.circle_id, auth.uid())
        or public.current_user_staff_role() is not null
      )
    ) or exists (
      select 1 from public.governance_disputes dispute
      where dispute.id = dispute_id and (
        dispute.opened_by = auth.uid() or dispute.against_user_id = auth.uid()
        or public.is_circle_admin(dispute.circle_id, auth.uid())
        or public.current_user_staff_role() is not null
      )
    )
  );

create or replace function public.sync_circle_chat_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare room_record public.circle_chat_rooms;
begin
  select * into room_record from public.circle_chat_rooms where circle_id = new.circle_id;
  if room_record.id is null then
    insert into public.circle_chat_rooms(circle_id, circle_type)
    select c.id, coalesce(c.circle_type, 'rotational') from public.circles c where c.id = new.circle_id
    on conflict (circle_id) do update set circle_type = excluded.circle_type
    returning * into room_record;
  end if;

  if new.status = 'approved' then
    insert into public.circle_chat_members(room_id, circle_membership_id, user_id, access_status)
    values (room_record.id, new.id, new.user_id, 'active')
    on conflict (circle_membership_id) do update
      set access_status = 'active', access_changed_at = now();
  elsif old.status = 'approved' and new.status <> 'approved' then
    update public.circle_chat_members set access_status = 'revoked', access_changed_at = now()
    where circle_membership_id = new.id;
  end if;
  return new;
end;
$$;

create trigger sync_circle_chat_membership
after insert or update of status on public.circle_members
for each row execute function public.sync_circle_chat_access();

insert into public.circle_chat_rooms(circle_id, circle_type, status)
select c.id, coalesce(c.circle_type, 'rotational'),
  case when c.status::text in ('archived', 'completed', 'cancelled') then 'read_only' else 'active' end
from public.circles c
on conflict (circle_id) do nothing;

insert into public.circle_chat_members(room_id, circle_membership_id, user_id, access_status, joined_at)
select room.id, member.id, member.user_id,
  case when member.status = 'approved' then 'active' else 'revoked' end,
  coalesce(member.approved_at, member.joined_at, member.created_at, now())
from public.circle_members member
join public.circle_chat_rooms room on room.circle_id = member.circle_id
on conflict (circle_membership_id) do nothing;

create or replace function public.create_circle_chat_room()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.circle_chat_rooms(circle_id, circle_type)
  values (new.id, coalesce(new.circle_type, 'rotational'))
  on conflict (circle_id) do nothing;
  return new;
end;
$$;
create trigger create_circle_chat_after_circle
after insert on public.circles for each row execute function public.create_circle_chat_room();

create or replace function public.send_circle_chat_message(
  check_room_id uuid, requested_body text, requested_type text default 'text',
  requested_reply_to uuid default null, requested_contribution_id uuid default null,
  requested_mentions uuid[] default '{}'::uuid[]
) returns public.circle_chat_messages
language plpgsql security definer set search_path = public as $$
declare room_record public.circle_chat_rooms; created_message public.circle_chat_messages;
begin
  if not public.can_send_circle_chat(check_room_id, auth.uid()) then
    raise exception 'Active Circle chat access is required';
  end if;
  if requested_type not in ('text', 'contribution_thread', 'announcement') then
    raise exception 'Customers cannot create this message type';
  end if;
  select * into room_record from public.circle_chat_rooms where id = check_room_id;
  if requested_type = 'announcement' and not public.is_circle_admin(room_record.circle_id, auth.uid()) then
    raise exception 'Only Circle administrators can post announcements';
  end if;
  if requested_contribution_id is not null and not exists (
    select 1 from public.contributions where id = requested_contribution_id
      and circle_id = room_record.circle_id
  ) then raise exception 'Contribution does not belong to this Circle'; end if;
  if requested_reply_to is not null and not exists (
    select 1 from public.circle_chat_messages where id = requested_reply_to
      and room_id = check_room_id
  ) then raise exception 'Reply target does not belong to this chat'; end if;

  insert into public.circle_chat_messages(
    room_id, circle_id, sender_user_id, message_type, body, reply_to_message_id,
    contribution_id, mentioned_user_ids
  ) values (
    check_room_id, room_record.circle_id, auth.uid(), requested_type,
    trim(requested_body), requested_reply_to, requested_contribution_id,
    coalesce(requested_mentions, '{}'::uuid[])
  ) returning * into created_message;

  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), case when requested_type = 'announcement' then 'circle_announcement_posted'
    when requested_type = 'contribution_thread' then 'contribution_thread_created'
    else 'circle_message_sent' end, 'circle_chat_message', created_message.id,
    'Circle chat action recorded without message content.',
    jsonb_build_object('circle_id', room_record.circle_id, 'room_id', check_room_id,
      'message_type', requested_type, 'contribution_id', requested_contribution_id));
  return created_message;
end;
$$;

create or replace function public.edit_circle_chat_message(check_message_id uuid, requested_body text)
returns public.circle_chat_messages
language plpgsql security definer set search_path = public as $$
declare message_record public.circle_chat_messages; edited_message public.circle_chat_messages;
begin
  select * into message_record from public.circle_chat_messages where id = check_message_id;
  if message_record.sender_user_id <> auth.uid() or message_record.message_type <> 'text'
    or message_record.evidence_locked or message_record.deleted_at is not null
    or message_record.created_at < now() - interval '15 minutes' then
    raise exception 'This message can no longer be edited';
  end if;
  insert into public.circle_chat_message_edits(message_id, previous_body, edited_by)
  values (message_record.id, message_record.body, auth.uid());
  update public.circle_chat_messages set body = trim(requested_body), edited_at = now(),
    edit_count = edit_count + 1, updated_at = now()
  where id = check_message_id returning * into edited_message;
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'circle_message_edited', 'circle_chat_message', check_message_id,
    'Circle message edit recorded without message content.',
    jsonb_build_object('circle_id', message_record.circle_id, 'edit_count', edited_message.edit_count));
  return edited_message;
end;
$$;

create or replace function public.delete_circle_chat_message(check_message_id uuid, requested_reason text)
returns public.circle_chat_messages
language plpgsql security definer set search_path = public as $$
declare message_record public.circle_chat_messages; deleted_message public.circle_chat_messages;
begin
  select * into message_record from public.circle_chat_messages where id = check_message_id;
  if message_record.message_type in ('system', 'governance_event')
    or message_record.evidence_locked or message_record.governance_request_id is not null
    or message_record.dispute_id is not null then
    raise exception 'Authoritative or preserved messages cannot be deleted';
  end if;
  if message_record.sender_user_id <> auth.uid()
    and not public.is_circle_admin(message_record.circle_id, auth.uid()) then
    raise exception 'Message moderation access required';
  end if;
  insert into public.circle_chat_message_edits(message_id, previous_body, edited_by)
  values (message_record.id, message_record.body, auth.uid());
  update public.circle_chat_messages set body = '[Message removed]', deleted_at = now(), deleted_by = auth.uid(),
    deletion_reason = nullif(trim(requested_reason), ''), moderation_status = 'hidden',
    updated_at = now()
  where id = check_message_id returning * into deleted_message;
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'circle_message_deleted', 'circle_chat_message', check_message_id,
    'Circle message was soft deleted; content remains retained.',
    jsonb_build_object('circle_id', message_record.circle_id));
  return deleted_message;
end;
$$;

create or replace function public.attach_circle_message_to_case(
  check_message_id uuid, check_governance_request_id uuid default null,
  check_dispute_id uuid default null
) returns public.circle_chat_case_messages
language plpgsql security definer set search_path = public as $$
declare message_record public.circle_chat_messages; linked_case public.circle_chat_case_messages;
begin
  if (check_governance_request_id is not null)::integer
    + (check_dispute_id is not null)::integer <> 1 then
    raise exception 'Exactly one governance case is required';
  end if;
  select * into message_record from public.circle_chat_messages where id = check_message_id;
  if not public.can_read_circle_chat(message_record.room_id, auth.uid()) then
    raise exception 'Chat access required';
  end if;
  if check_governance_request_id is not null and not exists (
    select 1 from public.governance_requests request
    where request.id = check_governance_request_id
      and request.circle_id = message_record.circle_id
      and (request.requested_by = auth.uid() or request.subject_user_id = auth.uid()
        or public.is_circle_admin(request.circle_id, auth.uid())
        or public.current_user_staff_role() is not null)
  ) then raise exception 'Governance case access required'; end if;
  if check_dispute_id is not null and not exists (
    select 1 from public.governance_disputes dispute
    where dispute.id = check_dispute_id and dispute.circle_id = message_record.circle_id
      and (dispute.opened_by = auth.uid() or dispute.against_user_id = auth.uid()
        or public.is_circle_admin(dispute.circle_id, auth.uid())
        or public.current_user_staff_role() is not null)
  ) then raise exception 'Dispute access required'; end if;
  insert into public.circle_chat_case_messages(
    message_id, governance_request_id, dispute_id, attached_by
  ) values (
    check_message_id, check_governance_request_id, check_dispute_id, auth.uid()
  ) returning * into linked_case;
  return linked_case;
end;
$$;

create or replace function public.grant_ops_circle_chat_access(
  check_room_id uuid, check_ops_user_id uuid, check_reason text,
  check_governance_request_id uuid default null, check_dispute_id uuid default null
) returns public.ops_chat_access
language plpgsql security definer set search_path = public as $$
declare room_record public.circle_chat_rooms; case_label text; granted_access public.ops_chat_access;
begin
  if public.current_user_staff_role() not in ('super_admin', 'compliance') then
    raise exception 'Compliance authorisation is required';
  end if;
  if check_ops_user_id = auth.uid() then raise exception 'Staff cannot grant themselves chat access'; end if;
  if not exists (
    select 1 from public.profiles where user_id = check_ops_user_id
      and role in ('operations', 'compliance', 'super_admin') and account_status = 'active'
  ) then raise exception 'The selected user is not authorised Operations staff'; end if;
  select * into room_record from public.circle_chat_rooms where id = check_room_id;
  if (check_governance_request_id is not null)::integer
    + (check_dispute_id is not null)::integer <> 1 then
    raise exception 'Exactly one active governance case is required';
  end if;
  if check_governance_request_id is not null then
    select request.case_id into case_label from public.governance_requests request
    where request.id = check_governance_request_id and request.circle_id = room_record.circle_id
      and request.status in ('pending', 'under_review');
  else
    select dispute.case_id into case_label from public.governance_disputes dispute
    where dispute.id = check_dispute_id and dispute.circle_id = room_record.circle_id
      and dispute.status in ('open', 'under_review', 'awaiting_evidence');
  end if;
  if case_label is null then raise exception 'An active case for this Circle is required'; end if;

  insert into public.ops_chat_access(
    room_id, ops_user_id, governance_request_id, dispute_id,
    access_reason, access_granted_by
  ) values (
    check_room_id, check_ops_user_id, check_governance_request_id,
    check_dispute_id, trim(check_reason), auth.uid()
  ) returning * into granted_access;
  insert into public.circle_chat_messages(room_id, circle_id, message_type, body, event_key)
  values (
    room_record.id, room_record.circle_id, 'system',
    'An authorised SikaCircle Operations officer joined this conversation for Case ' || case_label || '.',
    'ops_access_granted:' || granted_access.id
  );
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'ops_chat_access_granted', 'ops_chat_access', granted_access.id,
    'Time-bound case chat access granted.',
    jsonb_build_object('room_id', check_room_id, 'ops_user_id', check_ops_user_id,
      'case_id', case_label, 'reason', check_reason));
  return granted_access;
end;
$$;

create or replace function public.revoke_ops_circle_chat_access(check_access_id uuid, check_reason text)
returns public.ops_chat_access
language plpgsql security definer set search_path = public as $$
declare revoked_access public.ops_chat_access;
begin
  if public.current_user_staff_role() not in ('super_admin', 'compliance') then
    raise exception 'Compliance authorisation is required';
  end if;
  update public.ops_chat_access set access_revoked_at = now()
  where id = check_access_id and access_revoked_at is null returning * into revoked_access;
  if revoked_access.id is null then raise exception 'Active Operations access not found'; end if;
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'ops_chat_access_revoked', 'ops_chat_access', revoked_access.id,
    'Case chat access revoked.',
    jsonb_build_object('room_id', revoked_access.room_id, 'reason', check_reason));
  return revoked_access;
end;
$$;

create or replace function public.report_circle_chat_message(
  check_message_id uuid, requested_reason text, requested_details text default null
) returns public.circle_message_reports
language plpgsql security definer set search_path = public as $$
declare message_record public.circle_chat_messages; created_report public.circle_message_reports;
begin
  select * into message_record from public.circle_chat_messages where id = check_message_id;
  if not public.can_read_circle_chat(message_record.room_id, auth.uid()) then
    raise exception 'Chat access required';
  end if;
  insert into public.circle_message_reports(message_id, reported_by, reason, details)
  values (check_message_id, auth.uid(), requested_reason, requested_details)
  returning * into created_report;
  update public.circle_chat_messages set moderation_status = 'reported', updated_at = now()
  where id = check_message_id and moderation_status = 'visible';
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'circle_message_reported', 'circle_chat_message', check_message_id,
    'Circle message report recorded without message content.',
    jsonb_build_object('circle_id', message_record.circle_id, 'reason', requested_reason));
  return created_report;
end;
$$;

create or replace function public.mark_circle_chat_read(check_room_id uuid, check_message_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_read_circle_chat(check_room_id, auth.uid()) then
    raise exception 'Chat access required';
  end if;
  if check_message_id is not null and not exists (
    select 1 from public.circle_chat_messages where id = check_message_id and room_id = check_room_id
  ) then raise exception 'Message does not belong to this chat'; end if;
  insert into public.circle_chat_reads(room_id, user_id, last_read_message_id, last_read_at)
  values (check_room_id, auth.uid(), check_message_id, now())
  on conflict (room_id, user_id) do update set
    last_read_message_id = excluded.last_read_message_id, last_read_at = now();
end;
$$;

create or replace function public.post_circle_chat_system_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare room_record public.circle_chat_rooms; system_body text; system_key text;
begin
  select room.* into room_record from public.circle_chat_rooms room where room.circle_id = new.circle_id;
  if room_record.id is null then return new; end if;
  if tg_table_name = 'contributions' then
    if new.status::text in ('paid', 'processed') and
      (tg_op = 'INSERT' or old.status is distinct from new.status) then
      system_body := 'A Circle contribution was confirmed by the payment system.';
      system_key := 'contribution_confirmed:' || new.id || ':' || new.status::text;
    elsif new.status::text in ('late', 'overdue') and
      (tg_op = 'INSERT' or old.status is distinct from new.status) then
      system_body := 'A scheduled Circle contribution is now ' || new.status::text || '.';
      system_key := 'contribution_status:' || new.id || ':' || new.status::text;
    end if;
  elsif tg_table_name = 'circle_members' and new.status = 'approved'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    system_body := 'A member joined the Circle.';
    system_key := 'member_joined:' || new.id;
  end if;
  if system_body is not null then
    insert into public.circle_chat_messages(
      room_id, circle_id, message_type, body, contribution_id, event_key
    ) values (
      room_record.id, new.circle_id, 'system', system_body,
      case when tg_table_name = 'contributions' then new.id else null end, system_key
    ) on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

create trigger contribution_chat_system_event
after insert or update of status on public.contributions
for each row execute function public.post_circle_chat_system_message();
create trigger membership_chat_system_event
after insert or update of status on public.circle_members
for each row execute function public.post_circle_chat_system_message();

create or replace function public.post_governance_chat_system_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare room_record public.circle_chat_rooms;
begin
  if new.circle_id is null then return new; end if;
  select room.* into room_record from public.circle_chat_rooms room where room.circle_id = new.circle_id;
  if room_record.id is null then return new; end if;
  insert into public.circle_chat_messages(
    room_id, circle_id, message_type, body, governance_event_id, governance_request_id,
    dispute_id, event_key, evidence_locked, moderation_status
  ) values (
    room_record.id, new.circle_id, 'governance_event', new.description, new.id,
    new.request_id, new.dispute_id, 'governance_event:' || new.id,
    true, 'preserved'
  ) on conflict (event_key) do nothing;
  return new;
end;
$$;
create trigger governance_chat_system_event
after insert on public.governance_events
for each row execute function public.post_governance_chat_system_message();

create or replace function public.lock_circle_chat_case_evidence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.circle_chat_messages set evidence_locked = true,
    moderation_status = 'preserved', updated_at = now() where id = new.message_id;
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'message_attached_to_case', 'circle_chat_message', new.message_id,
    'Circle message preserved as governance evidence.',
    jsonb_build_object('governance_request_id', new.governance_request_id,
      'dispute_id', new.dispute_id));
  return new;
end;
$$;
create trigger lock_circle_chat_evidence
after insert on public.circle_chat_case_messages
for each row execute function public.lock_circle_chat_case_evidence();

alter table public.notifications
  add column if not exists chat_message_id uuid references public.circle_chat_messages(id) on delete restrict;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'join_request', 'membership_approved', 'membership_rejected',
  'payment_due_tomorrow', 'payment_due_today', 'payment_successful',
  'payment_failed', 'payment_retry_scheduled', 'payment_overdue',
  'payout_due', 'payout_matured', 'payout_processing',
  'payout_successful', 'payout_failed',
  'goal_progress', 'goal_target_reached', 'goal_matured',
  'goal_payout_processing', 'goal_payout_successful',
  'chat_message', 'chat_mention', 'chat_reply', 'chat_announcement',
  'contribution_thread', 'governance_case_message'
));

create or replace function public.notify_circle_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, circle_id, type, title, body, chat_message_id)
  select member.user_id, new.circle_id,
    case
      when new.message_type in ('system', 'governance_event') then 'governance_case_message'
      when member.user_id = any(new.mentioned_user_ids) then 'chat_mention'
      when new.message_type = 'announcement' then 'chat_announcement'
      when new.message_type = 'contribution_thread' then 'contribution_thread'
      when new.reply_to_message_id is not null and parent.sender_user_id = member.user_id then 'chat_reply'
      else 'chat_message'
    end,
    case when new.message_type in ('system', 'governance_event') then 'Important Circle update'
      when new.message_type = 'announcement' then 'New Circle announcement'
      else 'New Circle message' end,
    case when new.message_type in ('system', 'governance_event') then new.body
      when new.message_type = 'contribution_thread'
      then 'A contribution discussion has a new message.'
      else 'There is a new message in your Circle.' end,
    new.id
  from public.circle_chat_members member
  left join public.circle_chat_messages parent on parent.id = new.reply_to_message_id
  where member.room_id = new.room_id and member.access_status = 'active'
    and member.user_id <> new.sender_user_id
    and (
      not member.ordinary_notifications_muted
      or member.user_id = any(new.mentioned_user_ids)
      or new.message_type in ('announcement', 'system', 'governance_event')
      or (new.reply_to_message_id is not null and parent.sender_user_id = member.user_id)
    );
  return new;
end;
$$;
create trigger notify_circle_chat_after_message
after insert on public.circle_chat_messages
for each row execute function public.notify_circle_chat_message();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'circle-chat-attachments', 'circle-chat-attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Circle chat members read private attachments" on storage.objects for select
using (
  bucket_id = 'circle-chat-attachments'
  and public.can_read_circle_chat((storage.foldername(name))[1]::uuid, auth.uid())
);
create policy "Circle chat members upload controlled attachments" on storage.objects for insert
with check (
  bucket_id = 'circle-chat-attachments'
  and public.can_send_circle_chat((storage.foldername(name))[1]::uuid, auth.uid())
  and owner_id = auth.uid()::text
);

revoke all on function public.can_read_circle_chat(uuid, uuid) from public, anon;
revoke all on function public.can_send_circle_chat(uuid, uuid) from public, anon;
revoke all on function public.send_circle_chat_message(uuid, text, text, uuid, uuid, uuid[]) from public, anon;
revoke all on function public.edit_circle_chat_message(uuid, text) from public, anon;
revoke all on function public.delete_circle_chat_message(uuid, text) from public, anon;
revoke all on function public.report_circle_chat_message(uuid, text, text) from public, anon;
revoke all on function public.mark_circle_chat_read(uuid, uuid) from public, anon;
revoke all on function public.attach_circle_message_to_case(uuid, uuid, uuid) from public, anon;
revoke all on function public.grant_ops_circle_chat_access(uuid, uuid, text, uuid, uuid) from public, anon;
revoke all on function public.revoke_ops_circle_chat_access(uuid, text) from public, anon;
grant execute on function public.can_read_circle_chat(uuid, uuid) to authenticated;
grant execute on function public.can_send_circle_chat(uuid, uuid) to authenticated;
grant execute on function public.send_circle_chat_message(uuid, text, text, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.edit_circle_chat_message(uuid, text) to authenticated;
grant execute on function public.delete_circle_chat_message(uuid, text) to authenticated;
grant execute on function public.report_circle_chat_message(uuid, text, text) to authenticated;
grant execute on function public.mark_circle_chat_read(uuid, uuid) to authenticated;
grant execute on function public.attach_circle_message_to_case(uuid, uuid, uuid) to authenticated;
grant execute on function public.grant_ops_circle_chat_access(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.revoke_ops_circle_chat_access(uuid, text) to authenticated;

alter publication supabase_realtime add table public.circle_chat_messages;

comment on table public.circle_chat_messages is
  'Communication-only Circle messages. No message can mutate authoritative financial or governance state.';
