-- Cross-device privacy controls: read receipts, blocking, and disappearing messages.
-- Run this before deploying the app bundle that uses these columns and RPCs.

alter table public.macrochat_conversation_members
  add column if not exists receipt_read_at timestamptz;

alter table public.macrochat_conversations
  add column if not exists message_ttl_seconds integer
  check (message_ttl_seconds is null or message_ttl_seconds in (3600, 86400, 604800, 2592000));

alter table public.macrochat_messages
  add column if not exists expires_at timestamptz;

create table if not exists public.macrochat_user_privacy (
  user_id uuid primary key references public.macrochat_profiles(id) on delete cascade,
  read_receipts boolean not null default true,
  share_typing_activity boolean not null default true,
  allow_incoming_calls boolean not null default true,
  default_message_ttl_seconds integer
    check (default_message_ttl_seconds is null or default_message_ttl_seconds in (3600, 86400, 604800, 2592000)),
  updated_at timestamptz not null default now()
);

create table if not exists public.macrochat_blocked_users (
  blocker_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  blocked_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.macrochat_expired_media_queue (
  media_path text primary key,
  queued_at timestamptz not null default now()
);

create index if not exists macrochat_blocked_users_blocked_idx
  on public.macrochat_blocked_users (blocked_id, blocker_id);
create index if not exists macrochat_messages_expires_idx
  on public.macrochat_messages (expires_at) where expires_at is not null;

alter table public.macrochat_user_privacy enable row level security;
alter table public.macrochat_blocked_users enable row level security;
alter table public.macrochat_expired_media_queue enable row level security;

drop policy if exists "users manage own privacy" on public.macrochat_user_privacy;
create policy "users manage own privacy" on public.macrochat_user_privacy
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users read own blocks" on public.macrochat_blocked_users;
create policy "users read own blocks" on public.macrochat_blocked_users
for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "users add own blocks" on public.macrochat_blocked_users;
create policy "users add own blocks" on public.macrochat_blocked_users
for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists "users remove own blocks" on public.macrochat_blocked_users;
create policy "users remove own blocks" on public.macrochat_blocked_users
for delete to authenticated using (blocker_id = auth.uid());

drop policy if exists "users update own read state" on public.macrochat_conversation_members;
create policy "users update own read state" on public.macrochat_conversation_members
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.macrochat_users_are_blocked(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.macrochat_blocked_users b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  ) and (auth.uid() = first_user or auth.uid() = second_user);
$$;

create or replace function public.macrochat_conversation_is_blocked(target_conversation uuid, actor uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select actor = auth.uid() and exists (
    select 1
    from public.macrochat_conversation_members m
    where m.conversation_id = target_conversation
      and m.user_id <> actor
      and public.macrochat_users_are_blocked(actor, m.user_id)
  );
$$;

create or replace function public.macrochat_find_profile_by_macro_id(target_macro_id text)
returns table (id uuid, macro_id text, display_name text, avatar_color text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.macro_id, p.display_name, p.avatar_color
  from public.macrochat_profiles p
  where p.macro_id = upper(trim(target_macro_id))
    and not public.macrochat_users_are_blocked(auth.uid(), p.id)
  limit 1;
$$;

create or replace function public.macrochat_stamp_message_expiry()
returns trigger language plpgsql security definer set search_path = public
as $$
declare selected_ttl integer;
begin
  if public.macrochat_conversation_is_blocked(new.conversation_id, new.sender_id) then
    raise exception using message = 'blocked_contact';
  end if;
  select message_ttl_seconds into selected_ttl
  from public.macrochat_conversations where id = new.conversation_id;
  if selected_ttl is not null then
    new.expires_at := now() + make_interval(secs => selected_ttl);
  end if;
  return new;
end;
$$;

drop trigger if exists macrochat_message_privacy_guard on public.macrochat_messages;
create trigger macrochat_message_privacy_guard
before insert on public.macrochat_messages
for each row execute function public.macrochat_stamp_message_expiry();

drop policy if exists "members read messages" on public.macrochat_messages;
create policy "members read messages" on public.macrochat_messages
for select to authenticated using (
  public.macrochat_is_conversation_member(conversation_id)
  and deleted_at is null
  and (expires_at is null or expires_at > now())
);

drop policy if exists "members send messages" on public.macrochat_messages;
create policy "members send messages" on public.macrochat_messages
for insert to authenticated with check (
  sender_id = auth.uid()
  and public.macrochat_is_conversation_member(conversation_id)
  and not public.macrochat_conversation_is_blocked(conversation_id, auth.uid())
);

drop policy if exists "senders update messages" on public.macrochat_messages;
create policy "senders update messages" on public.macrochat_messages
for update to authenticated using (
  sender_id = auth.uid()
  and not public.macrochat_conversation_is_blocked(conversation_id, auth.uid())
) with check (
  sender_id = auth.uid()
  and not public.macrochat_conversation_is_blocked(conversation_id, auth.uid())
);

drop policy if exists "macrochat members upload chat media" on storage.objects;
create policy "macrochat members upload chat media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'macrochat-media'
  and public.macrochat_is_conversation_member((storage.foldername(name))[1]::uuid)
  and not public.macrochat_conversation_is_blocked((storage.foldername(name))[1]::uuid, auth.uid())
);

create or replace function public.macrochat_list_blocked_users()
returns table (id uuid, macro_id text, display_name text, avatar_color text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.macro_id, p.display_name, p.avatar_color
  from public.macrochat_blocked_users b
  join public.macrochat_profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.macrochat_set_disappearing_timer(ttl_seconds integer)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if ttl_seconds is not null and ttl_seconds not in (3600, 86400, 604800, 2592000) then
    raise exception using message = 'unsupported_disappearing_timer';
  end if;
  insert into public.macrochat_user_privacy (user_id, default_message_ttl_seconds, updated_at)
  values (auth.uid(), ttl_seconds, now())
  on conflict (user_id) do update
    set default_message_ttl_seconds = excluded.default_message_ttl_seconds, updated_at = now();
  update public.macrochat_conversations c
  set message_ttl_seconds = ttl_seconds, updated_at = now()
  where not c.is_group
    and exists (
      select 1 from public.macrochat_conversation_members m
      where m.conversation_id = c.id and m.user_id = auth.uid()
    );
end;
$$;

create or replace function public.macrochat_cleanup_expired_messages()
returns integer language plpgsql security definer set search_path = public
as $$
declare deleted_count integer;
begin
  insert into public.macrochat_expired_media_queue (media_path)
  select distinct media_path from public.macrochat_messages
  where expires_at <= now() and media_path is not null
  on conflict do nothing;
  delete from public.macrochat_messages where expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.macrochat_list_blocked_users() to authenticated;
grant execute on function public.macrochat_set_disappearing_timer(integer) to authenticated;
revoke all on function public.macrochat_cleanup_expired_messages() from public, anon, authenticated;
grant execute on function public.macrochat_cleanup_expired_messages() to service_role;

do $$ begin
  alter publication supabase_realtime add table public.macrochat_blocked_users;
exception when duplicate_object then null; end $$;