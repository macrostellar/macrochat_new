-- Re-enable security after temporary dev bypass.
-- Run this before staging/production.

alter table public.macrochat_profiles enable row level security;
alter table public.macrochat_conversations enable row level security;
alter table public.macrochat_conversation_members enable row level security;
alter table public.macrochat_messages enable row level security;
alter table public.macrochat_message_reactions enable row level security;

-- Then run these existing scripts in order:
-- 1) supabase/schema.sql (to ensure base policies/functions exist)
-- 2) supabase/mfa-aal2-enforcement.sql (to add restrictive AAL2 policies)

-- Verification: relrowsecurity should be true for all rows below.
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
