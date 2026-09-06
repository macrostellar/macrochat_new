begin;

alter table public.macrochat_conversations
  alter column e2ee_required set default true;

update public.macrochat_conversations
set e2ee_required = true
where e2ee_required is distinct from true;

create or replace function public.macrochat_validate_required_e2ee_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'text' and (
    new.body_ciphertext is null
    or new.body_nonce is null
    or new.encryption_version is null
  ) then
    raise exception using message = 'Text messages require encrypted payload (ciphertext, nonce, encryption_version).';
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

commit;