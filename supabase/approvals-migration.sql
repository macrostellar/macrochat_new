-- Approvals: approval groups (backed by a group conversation), requests, quick-reply options and decisions.
-- Run in the hosted Supabase SQL Editor after schema.sql. Safe to re-run.

-- An approval group IS a group conversation (is_group = true) with extra settings.
create table if not exists public.macrochat_approval_groups (
  conversation_id uuid primary key references public.macrochat_conversations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  approval_mode text not null default 'all' check (approval_mode in ('all', 'any')),
  created_by uuid not null references public.macrochat_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.macrochat_approval_members (
  conversation_id uuid not null references public.macrochat_approval_groups(conversation_id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  role text not null default 'submitter' check (role in ('approver', 'submitter')),
  added_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.macrochat_approval_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.macrochat_approval_groups(conversation_id) on delete cascade,
  requester_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content_kind text not null default 'text' check (content_kind in ('text', 'email', 'image', 'video', 'file')),
  body text check (char_length(body) <= 8000),
  media_path text,
  media_name text,
  media_mime text,
  -- [{ "id": "a1", "label": "Send tomorrow morning" }]
  approve_options jsonb not null default '[]'::jsonb,
  approve_multi boolean not null default false,
  reject_options jsonb not null default '[]'::jsonb,
  reject_multi boolean not null default false,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.macrochat_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.macrochat_approval_requests(id) on delete cascade,
  approver_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'changes')),
  selected_options jsonb not null default '[]'::jsonb,
  comment text check (char_length(comment) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, approver_id)
);

create index if not exists macrochat_approval_members_user_idx on public.macrochat_approval_members (user_id, conversation_id);
create index if not exists macrochat_approval_requests_group_idx on public.macrochat_approval_requests (conversation_id, created_at desc);
create index if not exists macrochat_approval_requests_requester_idx on public.macrochat_approval_requests (requester_id, created_at desc);
create index if not exists macrochat_approval_decisions_request_idx on public.macrochat_approval_decisions (request_id);

-- Additive columns (safe on existing installs).
alter table public.macrochat_approval_groups add column if not exists category text not null default 'General' check (char_length(category) between 1 and 40);
alter table public.macrochat_approval_requests add column if not exists edited_at timestamptz;
create index if not exists macrochat_approval_requests_status_idx on public.macrochat_approval_requests (status, created_at desc);

-- Editing a pending request invalidates any decisions already made on the old content.
create or replace function public.macrochat_on_approval_request_edit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception using message = 'Only pending requests can be edited.';
  end if;
  new.edited_at := now();
  delete from public.macrochat_approval_decisions where request_id = new.id;
  return new;
end;
$$;

drop trigger if exists macrochat_approval_requests_edit on public.macrochat_approval_requests;
create trigger macrochat_approval_requests_edit
before update of title, content_kind, body, media_path, media_name, media_mime, approve_options, approve_multi, reject_options, reject_multi, due_at
on public.macrochat_approval_requests
for each row
when (
  old.title is distinct from new.title
  or old.content_kind is distinct from new.content_kind
  or old.body is distinct from new.body
  or old.media_path is distinct from new.media_path
  or old.approve_options is distinct from new.approve_options
  or old.approve_multi is distinct from new.approve_multi
  or old.reject_options is distinct from new.reject_options
  or old.reject_multi is distinct from new.reject_multi
  or old.due_at is distinct from new.due_at
)
execute function public.macrochat_on_approval_request_edit();

alter table public.macrochat_approval_groups enable row level security;
alter table public.macrochat_approval_members enable row level security;
alter table public.macrochat_approval_requests enable row level security;
alter table public.macrochat_approval_decisions enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.macrochat_is_approval_approver(target_conversation uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.macrochat_approval_members
    where conversation_id = target_conversation and user_id = auth.uid() and role = 'approver'
  );
$$;
grant execute on function public.macrochat_is_approval_approver(uuid) to authenticated;

create or replace function public.macrochat_is_approval_group_owner(target_conversation uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.macrochat_approval_groups
    where conversation_id = target_conversation and created_by = auth.uid()
  );
$$;
grant execute on function public.macrochat_is_approval_group_owner(uuid) to authenticated;

-- Recompute a request's status from its decisions and the group's approval mode.
create or replace function public.macrochat_recompute_approval_status(target_request uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  req record;
  mode text;
  approver_total integer;
  approved_count integer;
  has_rejected boolean;
  has_changes boolean;
  next_status text;
begin
  select * into req from public.macrochat_approval_requests where id = target_request;
  if req is null or req.status = 'cancelled' then return; end if;

  select approval_mode into mode from public.macrochat_approval_groups where conversation_id = req.conversation_id;

  -- The requester never counts as one of their own approvers.
  select count(*) into approver_total
  from public.macrochat_approval_members
  where conversation_id = req.conversation_id and role = 'approver' and user_id <> req.requester_id;

  select
    count(*) filter (where decision = 'approved'),
    bool_or(decision = 'rejected'),
    bool_or(decision = 'changes')
  into approved_count, has_rejected, has_changes
  from public.macrochat_approval_decisions
  where request_id = target_request;

  if coalesce(has_rejected, false) then
    next_status := 'rejected';
  elsif coalesce(has_changes, false) then
    next_status := 'changes';
  elsif approver_total > 0 and (
    (mode = 'any' and approved_count >= 1) or
    (mode = 'all' and approved_count >= approver_total)
  ) then
    next_status := 'approved';
  else
    next_status := 'pending';
  end if;

  update public.macrochat_approval_requests
  set status = next_status,
      resolved_at = case when next_status in ('approved', 'rejected') then now() else null end
  where id = target_request and status <> next_status;
end;
$$;

create or replace function public.macrochat_on_approval_decision_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.macrochat_after_approval_decision_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.macrochat_recompute_approval_status(coalesce(new.request_id, old.request_id));
  return null;
end;
$$;

drop trigger if exists macrochat_approval_decisions_before on public.macrochat_approval_decisions;
create trigger macrochat_approval_decisions_before
before insert or update on public.macrochat_approval_decisions
for each row execute function public.macrochat_on_approval_decision_change();

drop trigger if exists macrochat_approval_decisions_after on public.macrochat_approval_decisions;
create trigger macrochat_approval_decisions_after
after insert or update or delete on public.macrochat_approval_decisions
for each row execute function public.macrochat_after_approval_decision_change();

-- Only approvers (other than the requester) may decide, and only while the request is open.
create or replace function public.macrochat_validate_approval_decision()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  req record;
begin
  select * into req from public.macrochat_approval_requests where id = new.request_id;
  if req is null then
    raise exception using message = 'Approval request not found.';
  end if;
  if req.status = 'cancelled' then
    raise exception using message = 'This request was cancelled.';
  end if;
  if req.requester_id = new.approver_id then
    raise exception using message = 'You cannot approve your own request.';
  end if;
  if not exists (
    select 1 from public.macrochat_approval_members
    where conversation_id = req.conversation_id and user_id = new.approver_id and role = 'approver'
  ) then
    raise exception using message = 'Only approvers in this group can decide.';
  end if;
  return new;
end;
$$;

drop trigger if exists macrochat_approval_decisions_validate on public.macrochat_approval_decisions;
create trigger macrochat_approval_decisions_validate
before insert or update on public.macrochat_approval_decisions
for each row execute function public.macrochat_validate_approval_decision();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "members read approval groups" on public.macrochat_approval_groups;
create policy "members read approval groups" on public.macrochat_approval_groups for select to authenticated
  using (public.macrochat_is_conversation_member(conversation_id));
drop policy if exists "conversation creators create approval groups" on public.macrochat_approval_groups;
create policy "conversation creators create approval groups" on public.macrochat_approval_groups for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.macrochat_conversations c where c.id = conversation_id and c.created_by = auth.uid() and c.is_group = true)
  );
drop policy if exists "owners update approval groups" on public.macrochat_approval_groups;
create policy "owners update approval groups" on public.macrochat_approval_groups for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "owners delete approval groups" on public.macrochat_approval_groups;
create policy "owners delete approval groups" on public.macrochat_approval_groups for delete to authenticated
  using (created_by = auth.uid());

drop policy if exists "members read approval members" on public.macrochat_approval_members;
create policy "members read approval members" on public.macrochat_approval_members for select to authenticated
  using (public.macrochat_is_conversation_member(conversation_id));
drop policy if exists "owners add approval members" on public.macrochat_approval_members;
create policy "owners add approval members" on public.macrochat_approval_members for insert to authenticated
  with check (public.macrochat_is_approval_group_owner(conversation_id));
drop policy if exists "owners update approval members" on public.macrochat_approval_members;
create policy "owners update approval members" on public.macrochat_approval_members for update to authenticated
  using (public.macrochat_is_approval_group_owner(conversation_id)) with check (public.macrochat_is_approval_group_owner(conversation_id));
drop policy if exists "owners remove approval members" on public.macrochat_approval_members;
create policy "owners remove approval members" on public.macrochat_approval_members for delete to authenticated
  using (public.macrochat_is_approval_group_owner(conversation_id) or user_id = auth.uid());
drop policy if exists "owners remove group chat members" on public.macrochat_conversation_members;
create policy "owners remove group chat members" on public.macrochat_conversation_members for delete to authenticated
  using (public.macrochat_is_approval_group_owner(conversation_id) and user_id <> auth.uid());

drop policy if exists "members read approval requests" on public.macrochat_approval_requests;
create policy "members read approval requests" on public.macrochat_approval_requests for select to authenticated
  using (public.macrochat_is_conversation_member(conversation_id));
drop policy if exists "members create approval requests" on public.macrochat_approval_requests;
create policy "members create approval requests" on public.macrochat_approval_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and exists (select 1 from public.macrochat_approval_members m where m.conversation_id = macrochat_approval_requests.conversation_id and m.user_id = auth.uid())
  );
-- Requesters may only cancel their own open requests; status transitions otherwise come from the decision trigger.
drop policy if exists "requesters cancel approval requests" on public.macrochat_approval_requests;
create policy "requesters cancel approval requests" on public.macrochat_approval_requests for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid() and status in ('pending', 'cancelled'));
drop policy if exists "requesters delete approval requests" on public.macrochat_approval_requests;
create policy "requesters delete approval requests" on public.macrochat_approval_requests for delete to authenticated
  using (requester_id = auth.uid());

drop policy if exists "members read approval decisions" on public.macrochat_approval_decisions;
create policy "members read approval decisions" on public.macrochat_approval_decisions for select to authenticated
  using (exists (select 1 from public.macrochat_approval_requests r where r.id = request_id and public.macrochat_is_conversation_member(r.conversation_id)));
drop policy if exists "approvers add decisions" on public.macrochat_approval_decisions;
create policy "approvers add decisions" on public.macrochat_approval_decisions for insert to authenticated
  with check (
    approver_id = auth.uid()
    and exists (select 1 from public.macrochat_approval_requests r where r.id = request_id and public.macrochat_is_approval_approver(r.conversation_id))
  );
drop policy if exists "approvers change own decisions" on public.macrochat_approval_decisions;
create policy "approvers change own decisions" on public.macrochat_approval_decisions for update to authenticated
  using (approver_id = auth.uid()) with check (approver_id = auth.uid());

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.macrochat_approval_requests;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.macrochat_approval_decisions;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.macrochat_approval_members;
  exception when others then null;
  end;
end $$;
