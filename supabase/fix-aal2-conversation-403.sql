-- Fix: 403 Forbidden when creating a conversation / adding a new contact.
--
-- Cause: mfa-aal2-enforcement.sql installs RESTRICTIVE policies that require
-- aal2 on every chat table. Restrictive policies are AND-ed with the permissive
-- ones, so a signed-in user who has NOT enrolled MFA (including anonymous
-- sign-in, which is always aal1) fails the WITH CHECK on INSERT and Supabase
-- returns 403.
--
-- Fix: only require aal2 for users who actually have a verified MFA factor.
-- Users without MFA keep normal membership/ownership rules. Users with MFA
-- enrolled must still complete the second factor. This preserves security
-- instead of disabling RLS.

-- True only when the current user has at least one verified MFA factor.
create or replace function public.macrochat_mfa_enrolled()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = auth.uid()
      and f.status = 'verified'
  );
$$;

create or replace function public.macrochat_is_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

-- Passes when the user has no MFA enrolled, or has MFA and reached aal2.
create or replace function public.macrochat_aal_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (not public.macrochat_mfa_enrolled()) or public.macrochat_is_aal2();
$$;

grant execute on function public.macrochat_mfa_enrolled() to authenticated;
grant execute on function public.macrochat_is_aal2() to authenticated;
grant execute on function public.macrochat_aal_satisfied() to authenticated;

drop policy if exists "require aal2 for conversations" on public.macrochat_conversations;
create policy "require aal2 for conversations"
on public.macrochat_conversations
as restrictive
for all
to authenticated
using (public.macrochat_aal_satisfied())
with check (public.macrochat_aal_satisfied());

drop policy if exists "require aal2 for memberships" on public.macrochat_conversation_members;
create policy "require aal2 for memberships"
on public.macrochat_conversation_members
as restrictive
for all
to authenticated
using (public.macrochat_aal_satisfied())
with check (public.macrochat_aal_satisfied());

drop policy if exists "require aal2 for messages" on public.macrochat_messages;
create policy "require aal2 for messages"
on public.macrochat_messages
as restrictive
for all
to authenticated
using (public.macrochat_aal_satisfied())
with check (public.macrochat_aal_satisfied());

drop policy if exists "require aal2 for reactions" on public.macrochat_message_reactions;
create policy "require aal2 for reactions"
on public.macrochat_message_reactions
as restrictive
for all
to authenticated
using (public.macrochat_aal_satisfied())
with check (public.macrochat_aal_satisfied());

drop policy if exists "require aal2 for storage reads" on storage.objects;
create policy "require aal2 for storage reads"
on storage.objects
as restrictive
for select
to authenticated
using (bucket_id <> 'macrochat-media' or public.macrochat_aal_satisfied());

drop policy if exists "require aal2 for storage writes" on storage.objects;
create policy "require aal2 for storage writes"
on storage.objects
as restrictive
for insert
to authenticated
with check (bucket_id <> 'macrochat-media' or public.macrochat_aal_satisfied());

-- Make sure RLS is on (in case the dev bypass script was run previously).
alter table public.macrochat_profiles enable row level security;
alter table public.macrochat_conversations enable row level security;
alter table public.macrochat_conversation_members enable row level security;
alter table public.macrochat_messages enable row level security;
alter table public.macrochat_message_reactions enable row level security;

-- Verification: should return true for the current session.
-- select public.macrochat_mfa_enrolled() as mfa_enrolled,
--        public.macrochat_is_aal2()     as is_aal2,
--        public.macrochat_aal_satisfied() as allowed;
