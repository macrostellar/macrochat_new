-- Schedule the updates cleanup Edge Function every 15 minutes.
-- Reuses the same Vault secrets as cleanup-expired-messages-cron.sql:
-- macrochat_project_url, macrochat_service_role_key

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'macrochat-cleanup-expired-updates';

select cron.schedule(
  'macrochat-cleanup-expired-updates',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'macrochat_project_url'
      limit 1
    ) || '/functions/v1/cleanup-expired-updates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'macrochat_service_role_key'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
