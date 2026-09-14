-- Notification preferences + per-user ringtone selection.
-- Safe to re-run.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  messages text not null default 'on' check (messages in ('on', 'mentions', 'off')),
  calls text not null default 'on' check (calls in ('on', 'off')),
  status text not null default 'mentions' check (status in ('on', 'mentions', 'off')),
  updates text not null default 'on' check (updates in ('on', 'off')),
  sound boolean not null default true,
  vibration boolean not null default true,
  preview boolean not null default true,
  badge boolean not null default true,
  background_sync boolean not null default true,
  message_ringtone text not null default 'copper-and-reed',
  call_ringtone text not null default 'midnight-watch',
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences
  add column if not exists badge boolean not null default true;

alter table public.notification_preferences
  add column if not exists background_sync boolean not null default true;

alter table public.notification_preferences
  add column if not exists message_ringtone text not null default 'copper-and-reed';

alter table public.notification_preferences
  add column if not exists call_ringtone text not null default 'midnight-watch';

-- Groups are no longer offered in the product.
alter table public.notification_preferences drop column if exists groups;

alter table public.notification_preferences enable row level security;

drop policy if exists "own notification prefs" on public.notification_preferences;
create policy "own notification prefs"
  on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
