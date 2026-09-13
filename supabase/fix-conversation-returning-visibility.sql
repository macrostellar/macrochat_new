-- Fix: 403 / 42501 "new row violates row-level security policy" when creating a
-- conversation, even though the INSERT check (created_by = auth.uid()) passes.
--
-- Cause: the client creates the conversation row first and adds membership rows
-- immediately after. The only SELECT policy is "members read conversations",
-- which requires an existing row in macrochat_conversation_members. Because the
-- insert uses RETURNING id (PostgREST .select('id')), PostgreSQL applies the
-- SELECT policy to the returned row. No membership exists yet, the row is not
-- visible, and the statement is rejected.
--
-- Fix: let a user read conversations they created. This is additive and
-- permissive, so it is OR-ed with the existing membership rule. It does not
-- expose anyone else's conversations, and the restrictive aal2 policy still
-- applies on top.

drop policy if exists "creators read own conversations" on public.macrochat_conversations;
create policy "creators read own conversations"
on public.macrochat_conversations
for select
to authenticated
using (created_by = auth.uid());

-- Verification: run as an authenticated user with no membership rows yet.
-- The insert should succeed and return an id.
--
-- do $$
-- declare
--   v_uid uuid := 'PASTE-USER-UUID';
--   v_new_id uuid;
-- begin
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', v_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
--   execute 'set local role authenticated';
--   insert into public.macrochat_conversations (created_by, is_group)
--   values (auth.uid(), false)
--   returning id into v_new_id;
--   raise notice 'INSERT SUCCEEDED id=%', v_new_id;
--   raise exception 'intentional rollback';
-- end $$;
