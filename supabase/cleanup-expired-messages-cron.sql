-- Prerequisites in Supabase Dashboard > Project Settings > Vault:
-- 1. macrochat_project_url = https://pofbkteiymgiwciamyll.supabase.co
-- 2. macrochat_service_role_key = the project's service_role key
-- Never place the service_role key directly in this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'macrochat-cleanup-expired-messages';

select cron.schedule(
  'macrochat-cleanup-expired-messages',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'macrochat_project_url'
      limit 1
    ) || '/functions/v1/cleanup-expired-messages',
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

-- Verify after the first run:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'macrochat-cleanup-expired-messages';
--
-- select status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'macrochat-cleanup-expired-messages')
-- order by start_time desc
-- limit 10;
