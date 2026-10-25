-- 1 of 2: tables and photos. Run in the Supabase SQL editor, then run auth-roles.sql.
-- Safe to run again: it only adds what is missing and never deletes graded fruit.
-- Accounts do not use Supabase Auth: usernames and hashed passwords live in the credentials table,
-- and the app reaches every table only through the functions in auth-roles.sql.

-- bcrypt for password hashes (Supabase keeps extensions in the "extensions" schema).
create extension if not exists pgcrypto with schema extensions;

-- People: one row per admin or worker.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null check (role in ('admin', 'worker')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- An earlier version tied profiles to Supabase Auth (auth.users) and kept the username in it. Unlink it
-- so the table works as above; those older accounts have no password here and cannot sign in.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'username') then
    alter table profiles drop constraint if exists profiles_id_fkey;
    alter table profiles alter column id set default gen_random_uuid();
    alter table profiles drop column username;
  end if;
end $$;

-- Sign-in details, kept apart from profiles. The password is stored only as a bcrypt hash.
create table if not exists credentials (
  profile_id uuid primary key references profiles (id) on delete cascade,
  username text unique not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- One row per signed-in device. The app keeps the token and sends it with every call.
create table if not exists sessions (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists sessions_profile_idx on sessions (profile_id);

-- Graded fruit: one row per fruit, with its front and back photo and who scanned it.
-- Labels are plain text (not enums) so src/config/labels.ts can change without a migration.
create table if not exists gradings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  maturity text not null,
  quality text not null,
  source text not null default 'upload'
);
-- For databases created before these columns existed. Older fruit has no worker ("Unassigned").
alter table gradings add column if not exists image_path text;
alter table gradings add column if not exists back_image_path text;
alter table gradings add column if not exists worker_id uuid references profiles (id) on delete set null;
alter table gradings alter column worker_id drop default;
create index if not exists gradings_worker_idx on gradings (worker_id, created_at);

-- Photos: front and back of every fruit. The file names are random, so a photo can only be opened by
-- someone who already has its name.
insert into storage.buckets (id, name, public)
values ('gradings', 'gradings', true)
on conflict (id) do update set public = true;

-- Counts are read through count_scans() in auth-roles.sql; these older views are not used any more.
drop view if exists worker_counts;
drop view if exists inventory;
