-- Allow message senders to delete their own messages
drop policy if exists "senders delete messages" on public.macrochat_messages;
create policy "senders delete messages" on public.macrochat_messages 
  for delete 
  to authenticated 
  using (sender_id = auth.uid());
