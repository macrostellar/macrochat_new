-- MacroChat security audit helper for shared Supabase projects.
-- Run this in SQL Editor after enabling anonymous auth.

-- 1) Public schema tables without RLS (highest risk if exposed by grants/policies).
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename not like 'macrochat_%'
  and rowsecurity = false
order by tablename;

-- 2) Policies that allow broad authenticated access on non-MacroChat tables.
-- Review rows where qual = 'true' or with_check = 'true'.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename not like 'macrochat_%'
  and (
    roles::text ilike '%authenticated%'
    or roles::text ilike '%public%'
  )
order by tablename, policyname;

-- 3) Storage bucket policies that may expose non-MacroChat buckets.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- 4) Quick permission check for anon/authenticated on non-MacroChat tables.
select
  table_schema,
  table_name,
  privilege_type,
  grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name not like 'macrochat_%'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
