-- MacroChat MFA hardening: require AAL2 (2FA) for reading/sending chat data.
-- Run this after enabling MFA in Supabase Auth settings.

create or replace function public.macrochat_is_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

-- Restrictive policies are AND-ed with existing permissive policies.
-- This keeps your existing membership rules and adds mandatory MFA.
-- Do NOT enforce AAL2 on profile bootstrap reads during onboarding, otherwise
-- brand-new users can fail profile creation/bootstrap before reaching MFA setup.

drop policy if exists "require aal2 for conversations" on public.macrochat_conversations;
create policy "require aal2 for conversations"
on public.macrochat_conversations
as restrictive
for all
to authenticated
using (public.macrochat_is_aal2())
with check (public.macrochat_is_aal2());

drop policy if exists "require aal2 for memberships" on public.macrochat_conversation_members;
create policy "require aal2 for memberships"
on public.macrochat_conversation_members
as restrictive
for all
to authenticated
using (public.macrochat_is_aal2())
with check (public.macrochat_is_aal2());

drop policy if exists "require aal2 for messages" on public.macrochat_messages;
create policy "require aal2 for messages"
on public.macrochat_messages
as restrictive
for all
to authenticated
using (public.macrochat_is_aal2())
with check (public.macrochat_is_aal2());

drop policy if exists "require aal2 for reactions" on public.macrochat_message_reactions;
create policy "require aal2 for reactions"
on public.macrochat_message_reactions
as restrictive
for all
to authenticated
using (public.macrochat_is_aal2())
with check (public.macrochat_is_aal2());

drop policy if exists "require aal2 for storage reads" on storage.objects;
create policy "require aal2 for storage reads"
on storage.objects
as restrictive
for select
to authenticated
using (bucket_id = 'macrochat-media' and public.macrochat_is_aal2());

drop policy if exists "require aal2 for storage writes" on storage.objects;
create policy "require aal2 for storage writes"
on storage.objects
as restrictive
for insert
to authenticated
with check (bucket_id = 'macrochat-media' and public.macrochat_is_aal2());

-- Optional quick check:
-- select auth.jwt() ->> 'aal' as current_aal;
