-- Temporary dev mode: disable all restrictive AAL2 policies.
-- Use this during build/testing when MFA should not block core chat flows.
-- Re-run mfa-aal2-enforcement.sql before production launch.

drop policy if exists "require aal2 for profile reads" on public.macrochat_profiles;
drop policy if exists "require aal2 for conversations" on public.macrochat_conversations;
drop policy if exists "require aal2 for memberships" on public.macrochat_conversation_members;
drop policy if exists "require aal2 for messages" on public.macrochat_messages;
drop policy if exists "require aal2 for reactions" on public.macrochat_message_reactions;
drop policy if exists "require aal2 for storage reads" on storage.objects;
drop policy if exists "require aal2 for storage writes" on storage.objects;

-- Full dev bypass: disable RLS on core chat tables.
-- This removes non-MFA policy checks too, so private chat creation cannot be blocked by RLS.
alter table public.macrochat_profiles disable row level security;
alter table public.macrochat_conversations disable row level security;
alter table public.macrochat_conversation_members disable row level security;
alter table public.macrochat_messages disable row level security;
alter table public.macrochat_message_reactions disable row level security;

-- Verification: these should return 0 rows after this script runs.
select schemaname, tablename, policyname
from pg_policies
where policyname in (
	'require aal2 for profile reads',
	'require aal2 for conversations',
	'require aal2 for memberships',
	'require aal2 for messages',
	'require aal2 for reactions',
	'require aal2 for storage reads',
	'require aal2 for storage writes'
);

-- Verification: relrowsecurity should be false for all rows below.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
	and c.relname in (
		'macrochat_profiles',
		'macrochat_conversations',
		'macrochat_conversation_members',
		'macrochat_messages',
		'macrochat_message_reactions'
	)
order by c.relname;
