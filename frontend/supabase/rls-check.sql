-- Run in the Supabase SQL editor after auth-roles.sql. Everything happens in one transaction that is rolled
-- back, so no test users or rows are left behind. Any failed check stops with an error naming it.
begin;

-- Test accounts: worker A, worker B, an admin, and a disabled worker.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-a@farm.local'),
  ('00000000-0000-0000-0000-00000000000b', 'rls-b@farm.local'),
  ('00000000-0000-0000-0000-0000000000ad', 'rls-admin@farm.local'),
  ('00000000-0000-0000-0000-0000000000dd', 'rls-off@farm.local');
insert into profiles (id, username, full_name, role, active) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-a', 'Worker A', 'worker', true),
  ('00000000-0000-0000-0000-00000000000b', 'rls-b', 'Worker B', 'worker', true),
  ('00000000-0000-0000-0000-0000000000ad', 'rls-admin', 'Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000dd', 'rls-off', 'Disabled', 'worker', false);

-- Only the test rows count: other data in the project must not change the results.
create temp table ids (id uuid) on commit drop;
insert into ids values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000ad'), ('00000000-0000-0000-0000-0000000000dd');
grant select on ids to authenticated, anon;

-- Worker A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into gradings (maturity, quality, created_at) values ('ripe', 'good', '2026-10-25 15:30+00');
insert into gradings (maturity, quality, created_at) values ('ripe', 'good', '2026-10-25 16:30+00');
do $$ begin
  if (select count(*) from gradings where worker_id in (select id from ids)) <> 2 then
    raise exception 'FAIL: worker A should see exactly own 2 gradings';
  end if;
  if (select count(*) from profiles where id in (select id from ids)) <> 1 then
    raise exception 'FAIL: worker A should see only own profile';
  end if;
  if (select count(*) from worker_counts where worker_id in (select id from ids)
      and worker_id <> '00000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'FAIL: worker A sees other workers in worker_counts';
  end if;
  if not exists (select 1 from worker_counts where worker_id = '00000000-0000-0000-0000-00000000000a'
                 and day = '2026-10-25' and count = 1) then
    raise exception 'FAIL: 15:30 UTC should count on 2026-10-25 (Manila)';
  end if;
  if not exists (select 1 from worker_counts where worker_id = '00000000-0000-0000-0000-00000000000a'
                 and day = '2026-10-26' and count = 1) then
    raise exception 'FAIL: 16:30 UTC should count on 2026-10-26 (Manila)';
  end if;
  begin
    insert into gradings (maturity, quality, worker_id)
      values ('ripe', 'good', '00000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: worker A inserted a grading as worker B';
  exception when insufficient_privilege then null;
  end;
  delete from gradings where worker_id = '00000000-0000-0000-0000-00000000000a';
  if (select count(*) from gradings where worker_id = '00000000-0000-0000-0000-00000000000a') <> 2 then
    raise exception 'FAIL: a worker must not be able to delete';
  end if;
end $$;

-- Worker B sees nothing of A.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$ begin
  if (select count(*) from gradings where worker_id in (select id from ids)) <> 0 then
    raise exception 'FAIL: worker B can see worker A gradings';
  end if;
end $$;

-- A disabled worker cannot save.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000dd","role":"authenticated"}';
do $$ begin
  begin
    insert into gradings (maturity, quality) values ('ripe', 'good');
    raise exception 'FAIL: a disabled worker inserted a grading';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Anonymous visitors see nothing.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  if (select count(*) from gradings) <> 0 then
    raise exception 'FAIL: anon can read gradings';
  end if;
end $$;

-- The admin sees everyone and can delete.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
do $$ declare n int; begin
  if (select count(*) from gradings where worker_id in (select id from ids)) <> 2 then
    raise exception 'FAIL: admin should see worker A gradings';
  end if;
  if (select count(*) from profiles where id in (select id from ids)) <> 4 then
    raise exception 'FAIL: admin should see all profiles';
  end if;
  with d as (delete from gradings where worker_id = '00000000-0000-0000-0000-00000000000a' returning 1)
  select count(*) into n from d;
  if n <> 2 then
    raise exception 'FAIL: admin delete removed % rows, expected 2', n;
  end if;
end $$;

reset role;
select 'RLS checks passed' as result;
rollback;
