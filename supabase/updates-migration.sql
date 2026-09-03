-- Real "Updates" (Status) feature: photo/video/text updates visible to contacts for 24 hours.
-- Run this in the hosted Supabase SQL Editor.

create table if not exists public.macrochat_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video', 'text')),
  media_data text, -- base64 encoded media (no separate storage)
  caption text check (char_length(caption) <= 280),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- Add media_data column if it doesn't exist (for existing tables)
alter table public.macrochat_updates add column if not exists media_data text;
-- Drop old media_path column if it exists
alter table public.macrochat_updates drop column if exists media_path;

create table if not exists public.macrochat_update_views (
  update_id uuid not null references public.macrochat_updates(id) on delete cascade,
  viewer_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (update_id, viewer_id)
);

create index if not exists macrochat_updates_user_created_idx on public.macrochat_updates (user_id, created_at desc);
create index if not exists macrochat_updates_expires_idx on public.macrochat_updates (expires_at);

alter table public.macrochat_updates enable row level security;
alter table public.macrochat_update_views enable row level security;

-- Two users are "contacts" once they share a direct (non-group) conversation.
create or replace function public.macrochat_is_contact(target_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.macrochat_conversation_members m1
    join public.macrochat_conversation_members m2 on m1.conversation_id = m2.conversation_id
    join public.macrochat_conversations c on c.id = m1.conversation_id
    where c.is_group = false
      and m1.user_id = auth.uid()
      and m2.user_id = target_user
  );
$$;

grant execute on function public.macrochat_is_contact(uuid) to authenticated;

drop policy if exists "contacts read updates" on public.macrochat_updates;
create policy "contacts read updates" on public.macrochat_updates for select to authenticated using (
  user_id = auth.uid() or (expires_at > now() and public.macrochat_is_contact(user_id))
);
drop policy if exists "users post own updates" on public.macrochat_updates;
create policy "users post own updates" on public.macrochat_updates for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users delete own updates" on public.macrochat_updates;
create policy "users delete own updates" on public.macrochat_updates for delete to authenticated using (user_id = auth.uid());

drop policy if exists "participants read update views" on public.macrochat_update_views;
create policy "participants read update views" on public.macrochat_update_views for select to authenticated using (
  viewer_id = auth.uid() or exists (select 1 from public.macrochat_updates u where u.id = update_id and u.user_id = auth.uid())
);
drop policy if exists "viewers record own view" on public.macrochat_update_views;
create policy "viewers record own view" on public.macrochat_update_views for insert to authenticated with check (viewer_id = auth.uid());

-- Service-role only: removes expired rows (media_data is inline, auto-deleted with row)
drop function if exists public.macrochat_cleanup_expired_updates();
create or replace function public.macrochat_cleanup_expired_updates()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.macrochat_updates where expires_at <= now();
end;
$$;

revoke all on function public.macrochat_cleanup_expired_updates() from public, authenticated;
grant execute on function public.macrochat_cleanup_expired_updates() to service_role;

-- Add to publication if not already there
do $$
begin
  begin
    alter publication supabase_realtime add table public.macrochat_updates;
  exception when others then
    null; -- Table already in publication
  end;
end $$;
