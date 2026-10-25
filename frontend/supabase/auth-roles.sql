-- 2 of 2: functions and roles. Run in the Supabase SQL editor after schema.sql. Safe to run again.
--
-- The app uses only the anon key, with no Supabase Auth. It can call the functions below but cannot
-- read or write any table directly (Row Level Security is on and there are no policies), so the
-- credentials table, with its password hashes, is never exposed.
--
-- Accounts (the app has only a sign-in page, no registration):
--   1. Create the admin here in the SQL editor, once:
--        select create_admin('admin', 'Farm Admin', 'your-password');
--      create_admin() cannot be called from the app or with the anon key.
--   2. The admin signs in (login) and registers workers (create_worker).
--   3. login() returns a token; every other call needs it. A worker sees and saves only their own fruit;
--      the admin sees everything and is the only one who can delete.

-- ---------------------------------------------------------------------------------------------------
-- Row Level Security on, no policies: the anon key gets nothing from the tables themselves.
alter table profiles enable row level security;
alter table credentials enable row level security;
alter table sessions enable row level security;
alter table gradings enable row level security;
revoke all on profiles, credentials, sessions, gradings from anon, authenticated;

-- Policies from earlier versions (anonymous access, Supabase Auth roles).
drop policy if exists "anon insert" on gradings;
drop policy if exists "anon read" on gradings;
drop policy if exists "anon delete" on gradings;
drop policy if exists "worker insert own" on gradings;
drop policy if exists "own or admin read" on gradings;
drop policy if exists "admin delete" on gradings;
drop policy if exists "own or admin read" on profiles;

-- Photos: the app uploads them, shows them by their public address and deletes them with the fruit.
-- Deleting through the Storage API needs read access too.
drop policy if exists "anon upload gradings" on storage.objects;
drop policy if exists "anon read gradings" on storage.objects;
drop policy if exists "anon delete gradings" on storage.objects;
drop policy if exists "auth upload gradings" on storage.objects;
drop policy if exists "own or admin read gradings" on storage.objects;
drop policy if exists "admin delete gradings" on storage.objects;
drop function if exists is_admin(); -- only after the policies that used it are gone
create policy "anon upload gradings" on storage.objects for insert to anon
  with check (bucket_id = 'gradings');
create policy "anon read gradings" on storage.objects for select to anon
  using (bucket_id = 'gradings');
create policy "anon delete gradings" on storage.objects for delete to anon
  using (bucket_id = 'gradings');

-- ---------------------------------------------------------------------------------------------------
-- Internal helpers (not callable by the app).

-- The signed-in account behind a token. Raises when the token is unknown, expired or disabled.
create or replace function session_profile(p_token uuid) returns profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
begin
  select pr.* into p
  from sessions s join profiles pr on pr.id = s.profile_id
  where s.token = p_token and s.expires_at > now();
  if not found then
    raise exception 'Your session has expired. Sign in again.';
  end if;
  if not p.active then
    raise exception 'This account is disabled. Ask the admin.';
  end if;
  return p;
end $$;

create or replace function require_admin(p_token uuid) returns profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles := session_profile(p_token);
begin
  if p.role <> 'admin' then
    raise exception 'Only the admin can do this.';
  end if;
  return p;
end $$;

-- One account as the app sees it (never the password hash).
create or replace function account_json(p_id uuid) returns json
language sql volatile security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'username', c.username, 'full_name', p.full_name,
    'role', p.role, 'active', p.active, 'created_at', p.created_at)
  from profiles p left join credentials c on c.profile_id = p.id
  where p.id = p_id
$$;

-- Checks a new username and password; returns the cleaned username.
create or replace function check_new_login(p_username text, p_password text) returns text
language plpgsql immutable as $$
declare
  u text := lower(trim(coalesce(p_username, '')));
begin
  if u !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  return u;
end $$;

-- Creates an account with its username and hashed password; returns its id.
create or replace function add_account(p_username text, p_full_name text, p_password text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  u text := check_new_login(p_username, p_password);
  new_id uuid;
begin
  if trim(coalesce(p_full_name, '')) = '' then
    raise exception 'Enter the full name.';
  end if;
  if exists (select 1 from credentials where username = u) then
    raise exception 'Username already taken.';
  end if;
  insert into profiles (full_name, role) values (trim(p_full_name), p_role) returning id into new_id;
  insert into credentials (profile_id, username, password_hash)
  values (new_id, u, crypt(p_password, gen_salt('bf')));
  return new_id;
end $$;

create or replace function new_session(p_profile uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  delete from sessions where expires_at <= now(); -- tidy up old sign-ins
  insert into sessions (profile_id) values (p_profile) returning token into t;
  return json_build_object('token', t, 'profile', account_json(p_profile));
end $$;

revoke all on function session_profile(uuid), require_admin(uuid), account_json(uuid),
  check_new_login(text, text), add_account(text, text, text, text), new_session(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Signing in.

-- An earlier version let the app register the first admin. Removed: admins are made only below.
drop function if exists register_admin(text, text, text);
drop function if exists has_admin();

-- Creates an admin account. Only for the SQL editor: the app and the anon key cannot call it.
create or replace function create_admin(p_username text, p_full_name text, p_password text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  -- Two statements: read the account only after it is saved.
  new_id := add_account(p_username, p_full_name, p_password, 'admin');
  return account_json(new_id);
end $$;
revoke all on function create_admin(text, text, text) from public, anon, authenticated;

create or replace function login(p_username text, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  c credentials;
  is_active boolean;
begin
  select * into c from credentials where username = lower(trim(coalesce(p_username, '')));
  if not found or c.password_hash <> crypt(coalesce(p_password, ''), c.password_hash) then
    raise exception 'Wrong username or password.';
  end if;
  select active into is_active from profiles where id = c.profile_id;
  if not is_active then
    raise exception 'This account is disabled. Ask the admin.';
  end if;
  return new_session(c.profile_id);
end $$;

-- The account behind a saved token, or an error when it has expired.
create or replace function me(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  return account_json((session_profile(p_token)).id);
end $$;

create or replace function logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token = p_token
$$;

-- ---------------------------------------------------------------------------------------------------
-- Admin: workers.

create or replace function list_accounts(p_token uuid) returns setof json
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  return query
    select account_json(p.id) from profiles p
    order by p.role = 'admin' desc, p.full_name;
end $$;

create or replace function create_worker(p_token uuid, p_username text, p_full_name text, p_password text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  perform require_admin(p_token);
  -- Two statements: read the account only after it is saved.
  new_id := add_account(p_username, p_full_name, p_password, 'worker');
  return account_json(new_id);
end $$;

-- Disabling also signs the account out everywhere.
create or replace function set_account_active(p_token uuid, p_id uuid, p_active boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_admin(p_token);
begin
  if p_id = me.id and not p_active then
    raise exception 'You cannot disable your own account.';
  end if;
  update profiles set active = p_active where id = p_id;
  if not found then
    raise exception 'No such account.';
  end if;
  if not p_active then
    delete from sessions where profile_id = p_id;
  end if;
  return account_json(p_id);
end $$;

-- A new password signs the account out of its other devices.
create or replace function reset_password(p_token uuid, p_id uuid, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_admin(p_token);
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  update credentials set password_hash = crypt(p_password, gen_salt('bf')), updated_at = now()
  where profile_id = p_id;
  if not found then
    raise exception 'No such account.';
  end if;
  delete from sessions where profile_id = p_id and token <> p_token;
  return account_json(p_id);
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Fruit.

-- Saves one graded fruit under the signed-in account.
create or replace function record_grading(
  p_token uuid, p_maturity text, p_quality text,
  p_image_path text, p_back_image_path text, p_source text default 'upload'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles := session_profile(p_token);
  new_id uuid;
begin
  insert into gradings (maturity, quality, image_path, back_image_path, source, worker_id)
  values (p_maturity, p_quality, p_image_path, p_back_image_path, coalesce(p_source, 'upload'), me.id)
  returning id into new_id;
  return new_id;
end $$;

-- One page of fruit, oldest first. A worker gets only their own. The admin can filter with p_worker:
-- null for everyone, 'unassigned' for fruit from before accounts, or a worker's id.
create or replace function list_gradings(p_token uuid, p_limit int, p_offset int, p_worker text default null)
returns table (
  id uuid, created_at timestamptz, maturity text, quality text,
  image_path text, back_image_path text, worker_id uuid
)
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := session_profile(p_token);
begin
  return query
    select g.id, g.created_at, g.maturity, g.quality, g.image_path, g.back_image_path, g.worker_id
    from gradings g
    where case
      when me.role <> 'admin' then g.worker_id = me.id
      when p_worker is null then true
      when p_worker = 'unassigned' then g.worker_id is null
      else g.worker_id = p_worker::uuid
    end
    order by g.created_at, g.id
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

-- Fruit per worker, day and bin. Days are Philippine days, so a scan at 11:30 PM counts on that day.
-- A worker gets only their own rows; the admin gets everyone's.
create or replace function count_scans(p_token uuid)
returns table (worker_id uuid, day date, maturity text, quality text, count int)
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := session_profile(p_token);
begin
  return query
    select g.worker_id, (g.created_at at time zone 'Asia/Manila')::date, g.maturity, g.quality,
           count(*)::int
    from gradings g
    where me.role = 'admin' or g.worker_id = me.id
    group by 1, 2, 3, 4;
end $$;

-- Admin only. Returns the photo paths so the app can remove the photos as well.
create or replace function delete_grading(p_token uuid, p_id uuid)
returns table (image_path text, back_image_path text)
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  return query
    with d as (delete from gradings g where g.id = p_id returning g.image_path, g.back_image_path)
    select d.image_path, d.back_image_path from d;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- What the app may call.
revoke all on function login(text, text), me(uuid),
  logout(uuid), list_accounts(uuid), create_worker(uuid, text, text, text),
  set_account_active(uuid, uuid, boolean), reset_password(uuid, uuid, text),
  record_grading(uuid, text, text, text, text, text), list_gradings(uuid, int, int, text),
  count_scans(uuid), delete_grading(uuid, uuid)
  from public;
grant execute on function login(text, text), me(uuid),
  logout(uuid), list_accounts(uuid), create_worker(uuid, text, text, text),
  set_account_active(uuid, uuid, boolean), reset_password(uuid, uuid, text),
  record_grading(uuid, text, text, text, text, text), list_gradings(uuid, int, int, text),
  count_scans(uuid), delete_grading(uuid, uuid)
  to anon, authenticated;
