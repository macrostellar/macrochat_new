-- Allow video (and call) message kinds. The original constraint predates video support,
-- so inserts with kind='video' fail with macrochat_messages_kind_check.
alter table public.macrochat_messages
  drop constraint if exists macrochat_messages_kind_check;

alter table public.macrochat_messages
  add constraint macrochat_messages_kind_check
  check (kind in ('text', 'image', 'video', 'file', 'voice', 'system', 'call'));
