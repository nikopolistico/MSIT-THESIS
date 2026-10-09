-- Run once in the Supabase SQL editor: stores the front and back photo of every graded fruit and lets the app
-- delete a fruit together with its photo. Safe to run more than once.
alter table gradings add column if not exists image_path text;
alter table gradings add column if not exists back_image_path text;

insert into storage.buckets (id, name, public)
values ('gradings', 'gradings', true)
on conflict (id) do nothing;

drop policy if exists "anon upload gradings" on storage.objects;
drop policy if exists "anon read gradings" on storage.objects;
drop policy if exists "anon delete gradings" on storage.objects;
drop policy if exists "anon delete" on gradings;
-- shortcut: anyone with the anon key can upload, read and delete; add Supabase Auth and tighten before real deployment.
create policy "anon upload gradings" on storage.objects for insert to anon with check (bucket_id = 'gradings');
create policy "anon read gradings" on storage.objects for select to anon using (bucket_id = 'gradings');
create policy "anon delete gradings" on storage.objects for delete to anon using (bucket_id = 'gradings');
create policy "anon delete" on gradings for delete to anon using (true);
