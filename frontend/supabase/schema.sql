-- Run once in the Supabase SQL editor.
-- Labels are plain text (not enums) so src/config/labels.ts can change without a migration.
create table if not exists gradings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  maturity text not null,
  quality text not null,
  source text not null default 'upload'
);

create or replace view inventory with (security_invoker = true) as
  select maturity, quality, count(*)::int as count
  from gradings
  group by maturity, quality;

alter table gradings enable row level security;

-- shortcut: anyone with the anon key can insert/read; add Supabase Auth and tighten before real deployment.
create policy "anon insert" on gradings for insert to anon with check (true);
create policy "anon read" on gradings for select to anon using (true);

-- Photos and delete: the same statements as add-photos.sql, included here for new projects.
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
