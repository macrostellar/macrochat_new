-- Required for instant message/read-receipt events and server-calculated push badges.
begin;

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime publication is missing';
  end if;
  foreach table_name in array array['macrochat_messages', 'macrochat_conversation_members']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

alter table public.macrochat_messages replica identity full;
create index if not exists macrochat_messages_sync_cursor_idx
  on public.macrochat_messages (created_at, id);

create or replace function public.macrochat_unread_message_count(target_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.macrochat_messages message
  join public.macrochat_conversation_members member
    on member.conversation_id = message.conversation_id
  where member.user_id = target_user_id
    and message.sender_id <> target_user_id
    and (member.last_read_at is null or message.created_at > member.last_read_at)
    and (message.expires_at is null or message.expires_at > now())
    and not exists (
      select 1 from public.macrochat_approval_groups approval
      where approval.conversation_id = member.conversation_id
    );
$$;

revoke all on function public.macrochat_unread_message_count(uuid) from public, anon, authenticated;
grant execute on function public.macrochat_unread_message_count(uuid) to service_role;

commit;
