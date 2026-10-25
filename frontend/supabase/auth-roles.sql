-- Run once in the Supabase SQL editor (after schema.sql / add-photos.sql). Safe to run more than once.
-- Adds admin and worker accounts: every grading belongs to the worker who scanned it, a worker sees only
-- their own, and the admin sees and can delete everything. The rules live here, in Row Level Security,
-- so they hold even if someone bypasses the app.

-- Accounts. Rows are written only by the backend (service key), never by the browser.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  full_name text not null,
  role text not null check (role in ('admin', 'worker')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

-- security definer: reads profiles without going through its own RLS (which calls this function).
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active)
$$;

drop policy if exists "own or admin read" on profiles;
create policy "own or admin read" on profiles for select to authenticated
  using (id = auth.uid() or is_admin());

-- Who scanned each fruit. Older rows stay null and show as "Unassigned".
alter table gradings add column if not exists image_path text;
alter table gradings add column if not exists back_image_path text;
alter table gradings add column if not exists worker_id uuid references profiles (id) on delete set null;
alter table gradings alter column worker_id set default auth.uid();
alter table gradings enable row level security;

drop policy if exists "anon insert" on gradings;
drop policy if exists "anon read" on gradings;
drop policy if exists "anon delete" on gradings;
drop policy if exists "worker insert own" on gradings;
drop policy if exists "own or admin read" on gradings;
drop policy if exists "admin delete" on gradings;
create policy "worker insert own" on gradings for insert to authenticated
  with check (
    worker_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.active)
  );
create policy "own or admin read" on gradings for select to authenticated
  using (worker_id = auth.uid() or is_admin());
create policy "admin delete" on gradings for delete to authenticated using (is_admin());

-- Photos: private bucket, read through signed URLs.
insert into storage.buckets (id, name, public)
values ('gradings', 'gradings', false)
on conflict (id) do update set public = false;

drop policy if exists "anon upload gradings" on storage.objects;
drop policy if exists "anon read gradings" on storage.objects;
drop policy if exists "anon delete gradings" on storage.objects;
drop policy if exists "auth upload gradings" on storage.objects;
drop policy if exists "own or admin read gradings" on storage.objects;
drop policy if exists "admin delete gradings" on storage.objects;
create policy "auth upload gradings" on storage.objects for insert to authenticated
  with check (bucket_id = 'gradings');
-- The subquery runs under the caller's RLS on gradings, so a worker can only open their own photos.
create policy "own or admin read gradings" on storage.objects for select to authenticated
  using (
    bucket_id = 'gradings'
    and (
      is_admin()
      or exists (select 1 from gradings g where g.image_path = objects.name or g.back_image_path = objects.name)
    )
  );
create policy "admin delete gradings" on storage.objects for delete to authenticated
  using (bucket_id = 'gradings' and is_admin());

-- Counts. security_invoker: each caller sees only the rows RLS lets them see.
create or replace view inventory with (security_invoker = true) as
  select maturity, quality, count(*)::int as count
  from gradings
  group by maturity, quality;

-- Days are Philippine days, so a scan at 11:30 PM counts on that day.
create or replace view worker_counts with (security_invoker = true) as
  select worker_id,
         (created_at at time zone 'Asia/Manila')::date as day,
         maturity,
         quality,
         count(*)::int as count
  from gradings
  group by worker_id, day, maturity, quality;

-- One-time manual steps:
-- 1. Authentication > Sign In / Providers > Email: turn OFF "Confirm email". Workers log in with a
--    username; the app turns it into <username>@farm.local, which is never mailed.
-- 2. Create the first admin: Authentication > Users > Add user > email admin@farm.local, a password,
--    tick "Auto Confirm User". Then run, with that user's id:
--      insert into profiles (id, username, full_name, role)
--      values ('<auth user id>', 'admin', 'Farm admin', 'admin');
--    The admin logs in with username "admin" and creates workers from the Workers page.
