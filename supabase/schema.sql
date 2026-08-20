-- MacroChat Supabase schema. Every resource is namespaced for safe use in a shared project.
-- In Supabase Dashboard, enable Authentication > Providers > Anonymous before running the app.
create extension if not exists pgcrypto;

create table if not exists public.macrochat_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  macro_id text not null unique check (macro_id ~ '^MC-[A-Z]+-[0-9]{4}$'),
  display_name text not null check (char_length(display_name) between 2 and 32),
  avatar_color text not null default '#55B9FF',
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.macrochat_conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  e2ee_required boolean not null default false,
  created_by uuid not null references public.macrochat_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.macrochat_conversation_members (
  conversation_id uuid not null references public.macrochat_conversations(id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.macrochat_messages (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  conversation_id uuid not null references public.macrochat_conversations(id) on delete cascade,
  sender_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  body_ciphertext text,
  body_nonce text,
  encryption_version text,
  kind text not null default 'text' check (kind in ('text', 'image', 'file', 'voice', 'system')),
  media_path text,
  reply_to uuid references public.macrochat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  unique (sender_id, client_id)
);

create table if not exists public.macrochat_message_reactions (
  message_id uuid not null references public.macrochat_messages(id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists macrochat_messages_conversation_created_idx on public.macrochat_messages (conversation_id, created_at desc);
create index if not exists macrochat_members_user_idx on public.macrochat_conversation_members (user_id, conversation_id);
create index if not exists macrochat_profiles_macro_id_idx on public.macrochat_profiles (macro_id);

alter table public.macrochat_profiles enable row level security;
alter table public.macrochat_conversations enable row level security;
alter table public.macrochat_conversation_members enable row level security;
alter table public.macrochat_messages enable row level security;
alter table public.macrochat_message_reactions enable row level security;

create or replace function public.macrochat_is_conversation_member(target_conversation uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.macrochat_conversation_members where conversation_id = target_conversation and user_id = auth.uid()); $$;

create or replace function public.macrochat_validate_required_e2ee_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requires_e2ee boolean;
begin
  select coalesce(c.e2ee_required, false)
  into requires_e2ee
  from public.macrochat_conversations c
  where c.id = new.conversation_id;

  if requires_e2ee and new.kind = 'text' then
    if new.body_ciphertext is null or new.body_nonce is null or new.encryption_version is null then
      raise exception using message = 'Conversation requires encrypted payload (ciphertext, nonce, encryption_version).';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists macrochat_required_e2ee_guard on public.macrochat_messages;
create trigger macrochat_required_e2ee_guard
before insert or update of conversation_id, body, body_ciphertext, body_nonce, encryption_version, kind
on public.macrochat_messages
for each row
execute function public.macrochat_validate_required_e2ee_message();

drop policy if exists "users read own profile" on public.macrochat_profiles;
create policy "users read own profile" on public.macrochat_profiles for select to authenticated using (id = auth.uid());
drop policy if exists "users create own profile" on public.macrochat_profiles;
create policy "users create own profile" on public.macrochat_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "users update own profile" on public.macrochat_profiles;
create policy "users update own profile" on public.macrochat_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.macrochat_find_profile_by_macro_id(target_macro_id text)
returns table (id uuid, macro_id text, display_name text, avatar_color text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.macro_id, p.display_name, p.avatar_color
  from public.macrochat_profiles p
  where p.macro_id = upper(trim(target_macro_id))
  limit 1;
$$;

grant execute on function public.macrochat_find_profile_by_macro_id(text) to authenticated;

drop policy if exists "members read conversations" on public.macrochat_conversations;
create policy "members read conversations" on public.macrochat_conversations for select to authenticated using (public.macrochat_is_conversation_member(id));
drop policy if exists "users create conversations" on public.macrochat_conversations;
create policy "users create conversations" on public.macrochat_conversations for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "admins update conversation security" on public.macrochat_conversations;
create policy "admins update conversation security" on public.macrochat_conversations for update to authenticated using (
  created_by = auth.uid()
  or exists (
    select 1 from public.macrochat_conversation_members m
    where m.conversation_id = id and m.user_id = auth.uid() and m.role = 'admin'
  )
) with check (
  created_by = auth.uid()
  or exists (
    select 1 from public.macrochat_conversation_members m
    where m.conversation_id = id and m.user_id = auth.uid() and m.role = 'admin'
  )
);
drop policy if exists "members read memberships" on public.macrochat_conversation_members;
create policy "members read memberships" on public.macrochat_conversation_members for select to authenticated using (public.macrochat_is_conversation_member(conversation_id));
drop policy if exists "creators add members" on public.macrochat_conversation_members;
create policy "creators add members" on public.macrochat_conversation_members for insert to authenticated with check (
  user_id = auth.uid() or exists (select 1 from public.macrochat_conversations c where c.id = conversation_id and c.created_by = auth.uid())
);

drop policy if exists "members read messages" on public.macrochat_messages;
create policy "members read messages" on public.macrochat_messages for select to authenticated using (public.macrochat_is_conversation_member(conversation_id));
drop policy if exists "members send messages" on public.macrochat_messages;
create policy "members send messages" on public.macrochat_messages for insert to authenticated with check (sender_id = auth.uid() and public.macrochat_is_conversation_member(conversation_id));
drop policy if exists "senders update messages" on public.macrochat_messages;
create policy "senders update messages" on public.macrochat_messages for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());
drop policy if exists "members read reactions" on public.macrochat_message_reactions;
create policy "members read reactions" on public.macrochat_message_reactions for select to authenticated using (
  exists (select 1 from public.macrochat_messages m where m.id = message_id and public.macrochat_is_conversation_member(m.conversation_id))
);
drop policy if exists "members add own reactions" on public.macrochat_message_reactions;
create policy "members add own reactions" on public.macrochat_message_reactions for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.macrochat_messages m where m.id = message_id and public.macrochat_is_conversation_member(m.conversation_id))
);
drop policy if exists "users remove own reactions" on public.macrochat_message_reactions;
create policy "users remove own reactions" on public.macrochat_message_reactions for delete to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('macrochat-media', 'macrochat-media', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "macrochat members read chat media" on storage.objects;
create policy "macrochat members read chat media" on storage.objects for select to authenticated using (
  bucket_id = 'macrochat-media' and public.macrochat_is_conversation_member((storage.foldername(name))[1]::uuid)
);
drop policy if exists "macrochat members upload chat media" on storage.objects;
create policy "macrochat members upload chat media" on storage.objects for insert to authenticated with check (
  bucket_id = 'macrochat-media' and public.macrochat_is_conversation_member((storage.foldername(name))[1]::uuid)
);

-- Enable Realtime once per table. Ignore duplicate-publication errors when rerunning.
do $$ begin
  alter publication supabase_realtime add table public.macrochat_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.macrochat_conversation_members;
exception when duplicate_object then null; end $$;
