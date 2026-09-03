-- Status Update Reactions & Comments

create table if not exists public.macrochat_update_reactions (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.macrochat_updates(id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 10),
  created_at timestamptz not null default now(),
  unique(update_id, user_id, emoji)
);

create table if not exists public.macrochat_update_comments (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.macrochat_updates(id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  text text not null check (char_length(text) <= 280),
  created_at timestamptz not null default now()
);

-- Message Reactions & Comments

create table if not exists public.macrochat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.macrochat_messages(id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 10),
  created_at timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

create table if not exists public.macrochat_message_comments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.macrochat_messages(id) on delete cascade,
  user_id uuid not null references public.macrochat_profiles(id) on delete cascade,
  text text not null check (char_length(text) <= 280),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists macrochat_update_reactions_update_idx on public.macrochat_update_reactions(update_id);
create index if not exists macrochat_update_reactions_user_idx on public.macrochat_update_reactions(user_id);
create index if not exists macrochat_update_comments_update_idx on public.macrochat_update_comments(update_id);
create index if not exists macrochat_update_comments_user_idx on public.macrochat_update_comments(user_id);

create index if not exists macrochat_message_reactions_message_idx on public.macrochat_message_reactions(message_id);
create index if not exists macrochat_message_reactions_user_idx on public.macrochat_message_reactions(user_id);
create index if not exists macrochat_message_comments_message_idx on public.macrochat_message_comments(message_id);
create index if not exists macrochat_message_comments_user_idx on public.macrochat_message_comments(user_id);

-- Enable RLS
alter table public.macrochat_update_reactions enable row level security;
alter table public.macrochat_update_comments enable row level security;
alter table public.macrochat_message_reactions enable row level security;
alter table public.macrochat_message_comments enable row level security;

-- RLS Policies for Update Reactions
drop policy if exists "authenticated can read update reactions" on public.macrochat_update_reactions;
create policy "authenticated can read update reactions" on public.macrochat_update_reactions for select to authenticated using (true);

drop policy if exists "authenticated can add update reactions" on public.macrochat_update_reactions;
create policy "authenticated can add update reactions" on public.macrochat_update_reactions for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users can delete own update reactions" on public.macrochat_update_reactions;
create policy "users can delete own update reactions" on public.macrochat_update_reactions for delete to authenticated using (user_id = auth.uid());

-- RLS Policies for Update Comments
drop policy if exists "authenticated can read update comments" on public.macrochat_update_comments;
create policy "authenticated can read update comments" on public.macrochat_update_comments for select to authenticated using (true);

drop policy if exists "authenticated can add update comments" on public.macrochat_update_comments;
create policy "authenticated can add update comments" on public.macrochat_update_comments for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users can delete own update comments" on public.macrochat_update_comments;
create policy "users can delete own update comments" on public.macrochat_update_comments for delete to authenticated using (user_id = auth.uid());

-- RLS Policies for Message Reactions
drop policy if exists "authenticated can read message reactions" on public.macrochat_message_reactions;
create policy "authenticated can read message reactions" on public.macrochat_message_reactions for select to authenticated using (true);

drop policy if exists "authenticated can add message reactions" on public.macrochat_message_reactions;
create policy "authenticated can add message reactions" on public.macrochat_message_reactions for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users can delete own message reactions" on public.macrochat_message_reactions;
create policy "users can delete own message reactions" on public.macrochat_message_reactions for delete to authenticated using (user_id = auth.uid());

-- RLS Policies for Message Comments
drop policy if exists "authenticated can read message comments" on public.macrochat_message_comments;
create policy "authenticated can read message comments" on public.macrochat_message_comments for select to authenticated using (true);

drop policy if exists "authenticated can add message comments" on public.macrochat_message_comments;
create policy "authenticated can add message comments" on public.macrochat_message_comments for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users can delete own message comments" on public.macrochat_message_comments;
create policy "users can delete own message comments" on public.macrochat_message_comments for delete to authenticated using (user_id = auth.uid());

-- Realtime subscriptions
begin;
  alter publication supabase_realtime add table public.macrochat_update_reactions;
exception when others then
  null;
end;

begin;
  alter publication supabase_realtime add table public.macrochat_update_comments;
exception when others then
  null;
end;

begin;
  alter publication supabase_realtime add table public.macrochat_message_reactions;
exception when others then
  null;
end;

begin;
  alter publication supabase_realtime add table public.macrochat_message_comments;
exception when others then
  null;
end;
