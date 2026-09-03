-- Real call history log, merged into the Calls tab.
-- Run this in the hosted Supabase SQL Editor.

create table if not exists public.macrochat_call_history (
  call_id text primary key,
  conversation_id uuid not null references public.macrochat_conversations(id) on delete cascade,
  caller_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  callee_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  video boolean not null default false,
  outcome text not null check (outcome in ('answered', 'missed', 'rejected', 'cancelled')),
  duration_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now()
);

create index if not exists macrochat_call_history_participants_idx on public.macrochat_call_history (caller_id, callee_id, started_at desc);

alter table public.macrochat_call_history enable row level security;

drop policy if exists "participants read call history" on public.macrochat_call_history;
create policy "participants read call history" on public.macrochat_call_history for select to authenticated using (
  auth.uid() = caller_id or auth.uid() = callee_id
);
drop policy if exists "participants record call history" on public.macrochat_call_history;
create policy "participants record call history" on public.macrochat_call_history for insert to authenticated with check (
  auth.uid() = caller_id or auth.uid() = callee_id
);
drop policy if exists "participants update call history" on public.macrochat_call_history;
create policy "participants update call history" on public.macrochat_call_history for update to authenticated using (
  auth.uid() = caller_id or auth.uid() = callee_id
) with check (
  auth.uid() = caller_id or auth.uid() = callee_id
);

-- Add to publication if not already there
do $$
begin
  begin
    alter publication supabase_realtime add table public.macrochat_call_history;
  exception when others then
    null; -- Table already in publication
  end;
end $$;
