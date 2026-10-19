-- Profile photo storage.
-- Avatars are public so other users can render them without signed URLs.
-- Each user may only write into their own folder: <auth.uid()>/<file>.

insert into storage.buckets (id, name, public)
values ('macrochat-avatars', 'macrochat-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "macrochat avatars insert own folder" on storage.objects;
create policy "macrochat avatars insert own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'macrochat-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "macrochat avatars delete own folder" on storage.objects;
create policy "macrochat avatars delete own folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'macrochat-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
