-- Expo push tokens + the trigger that fans out a push on every new message.
-- Safe to re-run.
--
-- Prerequisites (run once, in this order):
--   1. supabase functions deploy send-push
--   2. Set the two settings at the bottom of this file to your project values.

create extension if not exists pg_net with schema extensions;

create table if not exists public.user_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_push_tokens_user_id_idx
  on public.user_push_tokens (user_id);

alter table public.user_push_tokens enable row level security;

drop policy if exists "own push tokens" on public.user_push_tokens;
create policy "own push tokens"
  on public.user_push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Fan-out trigger
-- ---------------------------------------------------------------------------

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text := current_setting('app.settings.push_function_url', true);
  fn_secret text := current_setting('app.settings.push_webhook_secret', true);
begin
  if fn_url is null or fn_url = '' then
    return new;
  end if;

  perform extensions.net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(fn_secret, '')
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'conversation_id', new.conversation_id,
        'sender_id', new.sender_id,
        'kind', new.kind
      )
    )
  );

  return new;
exception
  -- Never let a push failure roll back the message insert.
  when others then
    return new;
end;
$$;

drop trigger if exists macrochat_messages_push on public.macrochat_messages;
create trigger macrochat_messages_push
  after insert on public.macrochat_messages
  for each row
  execute function public.notify_new_message();

-- ---------------------------------------------------------------------------
-- Configuration - replace the placeholders, then run these two statements.
-- ---------------------------------------------------------------------------

-- alter database postgres set app.settings.push_function_url =
--   'https://pofbkteiymgiwciamyll.supabase.co/functions/v1/send-push';
-- alter database postgres set app.settings.push_webhook_secret = 'REPLACE_WITH_A_LONG_RANDOM_STRING';
