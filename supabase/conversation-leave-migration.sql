-- Lets a user remove their own membership (deleting a chat from their list).
-- Without this policy RLS silently deletes 0 rows and the chat returns on refresh.

drop policy if exists "users leave own memberships" on public.macrochat_conversation_members;
create policy "users leave own memberships"
on public.macrochat_conversation_members
for delete
to authenticated
using (user_id = auth.uid());
