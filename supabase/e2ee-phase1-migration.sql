-- Add phase-1 E2EE columns to existing projects.
alter table if exists public.macrochat_conversations
  add column if not exists e2ee_required boolean not null default false;

alter table if exists public.macrochat_messages
  add column if not exists body_ciphertext text,
  add column if not exists body_nonce text,
  add column if not exists encryption_version text;

create or replace function public.macrochat_validate_required_e2ee_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requires_e2ee boolean;
begin
  select coalesce(c.e2ee_required, false)
  into requires_e2ee
  from public.macrochat_conversations c
  where c.id = new.conversation_id;

  if requires_e2ee and new.kind = 'text' then
    if new.body_ciphertext is null or new.body_nonce is null or new.encryption_version is null then
      raise exception using message = 'Conversation requires encrypted payload (ciphertext, nonce, encryption_version).';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists macrochat_required_e2ee_guard on public.macrochat_messages;
create trigger macrochat_required_e2ee_guard
before insert or update of conversation_id, body, body_ciphertext, body_nonce, encryption_version, kind
on public.macrochat_messages
for each row
execute function public.macrochat_validate_required_e2ee_message();
