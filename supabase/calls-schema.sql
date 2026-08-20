-- Call state persistence (MVP for signaling/call history)
create table if not exists public.macrochat_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.macrochat_conversations(id) on delete cascade,
  started_by uuid not null references public.macrochat_profiles(id) on delete cascade,
  kind text not null check (kind in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists macrochat_calls_conversation_idx on public.macrochat_calls (conversation_id, started_at desc);

alter table public.macrochat_calls enable row level security;

create policy "members read calls" on public.macrochat_calls
for select to authenticated
using (public.macrochat_is_conversation_member(conversation_id));

create policy "members create calls" on public.macrochat_calls
for insert to authenticated
with check (started_by = auth.uid() and public.macrochat_is_conversation_member(conversation_id));

create policy "participants update calls" on public.macrochat_calls
for update to authenticated
using (public.macrochat_is_conversation_member(conversation_id))
with check (public.macrochat_is_conversation_member(conversation_id));
