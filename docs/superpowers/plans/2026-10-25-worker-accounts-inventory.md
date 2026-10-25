# Worker Accounts and Inventory Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin and worker accounts (username + password, no email). Workers scan fruit and see their own counts. The admin dashboard monitors the inventory with a per-worker breakdown and manages worker accounts.

**Architecture:** Supabase Auth holds the accounts and a `profiles` table holds the role. Row Level Security on `gradings`, the storage bucket and two views enforces "worker sees own, admin sees all". A small FastAPI router (`/api/admin/workers`) uses the Supabase service-role key to create, disable and reset workers. The Vue app gets an auth store, a login page, role-based router guards and a role-based nav.

**Tech Stack:** Supabase (Postgres RLS, Auth, Storage), FastAPI + httpx, pytest, Vue 3 + Pinia + Vue Router + Tailwind + shadcn-vue + Chart.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-worker-accounts-inventory-design.md`

## Global Constraints

- Login is username + password only. Email is `${username}@farm.local` and is never mailed. Users are created with `email_confirm: true`.
- Username rule: `^[a-z0-9._-]{3,32}$` (lowercased and trimmed before use). Password minimum: 8 characters.
- Roles: exactly `'admin'` and `'worker'`. A disabled account (`profiles.active = false`) cannot log in (Supabase ban) and cannot insert gradings (RLS).
- `SUPABASE_SERVICE_KEY` exists only in the backend env, never in `frontend/` or any `VITE_` variable.
- Days are counted in `Asia/Manila` time, both in the SQL views and in the frontend summaries.
- Existing gradings with `worker_id = null` are shown as "Unassigned" and only to the admin.
- Expert-review pages (`/review`, `/review/:id`, `/history`, `/model`) and `/grade` are admin-only.
- Commits: the user commits themselves. Each "Checkpoint" step means: stop, show the diff summary, and commit only if the user asks.
- Reply and UI copy are in English (as in the existing UI).

## Review Focus

1. **Disabled worker with a still-valid session.** A worker disabled while logged in must not be able to save another scan. Expected: the insert fails with a clear "account disabled" message. (Task 1 RLS check; Task 6 error message.)
2. **Admin disables or demotes their own account.** Expected: 400 "You cannot disable your own account", so the farm never ends up without an admin. (Task 2 test.)
3. **Late-night scans and the day boundary.** A scan at 23:30 Manila time (15:30 UTC) belongs to that Manila day, not the UTC day. Expected: it counts as "today" on the worker dashboard. (Task 4 test.)
4. **Duplicate username, including different case** (`Juan` vs `juan`). Expected: 409 "Username already taken", and no orphan auth user left behind. (Task 2 test.)
5. **Profile insert fails after the auth user was created.** Expected: the auth user is deleted again and the API returns 500 with the reason. (Task 2 test.)

---

### Task 1: Database roles, RLS and count views

**Files:**
- Create: `frontend/supabase/auth-roles.sql`
- Create: `frontend/supabase/rls-check.sql`
- Modify: `frontend/supabase/schema.sql` (append the same statements as `auth-roles.sql` for new projects, as done for `add-photos.sql`)

**Interfaces:**
- Produces (tables and views read by Tasks 2, 4, 6, 7):
  - `profiles(id uuid pk references auth.users on delete cascade, username text unique not null, full_name text not null, role text not null check (role in ('admin','worker')), active boolean not null default true, created_at timestamptz default now())`
  - `gradings.worker_id uuid references profiles(id) on delete set null default auth.uid()`
  - `is_admin() returns boolean` (security definer, `stable`, `search_path = public`): true when the caller's profile has role `admin` and is active.
  - view `inventory(maturity, quality, count int)` (unchanged columns)
  - view `worker_counts(worker_id uuid, day date, maturity text, quality text, count int)`, where `day = (created_at at time zone 'Asia/Manila')::date`
  - Both views use `security_invoker = true`.

- [ ] **Step 1: Write `rls-check.sql`**

A script run in the Supabase SQL editor inside `begin; ... rollback;`. It creates two workers, one admin and one disabled worker as rows in `auth.users` + `profiles`, then impersonates each with `set local role authenticated; set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}';` and asserts with `do $$ ... raise exception ... $$` blocks:
  - worker A inserts a grading. `select count(*) from gradings` returns 1 for A and 0 for B.
  - worker A cannot insert with `worker_id = B`. The insert raises (RLS violation).
  - the disabled worker's insert raises.
  - worker A's delete affects 0 rows. The admin's delete affects 1 row.
  - `worker_counts` returns only A's rows for A and every row for the admin.
  - the anon role (`set local role anon`) sees 0 gradings.
  - worker A can `select` only their own `profiles` row. The admin sees all of them.
  - A grading inserted at `'2026-10-25 15:30+00'` has `day = '2026-10-25'`, and one inserted at `'2026-10-25 16:30+00'` has `day = '2026-10-26'`.

The last line prints `select 'RLS checks passed';`.

- [ ] **Step 2: Run `rls-check.sql` and confirm it fails**

Run it in the Supabase SQL editor. Expected: an error like `relation "profiles" does not exist`.

- [ ] **Step 3: Write `auth-roles.sql`**

It must be safe to run again (`if not exists`, `drop policy if exists`, `create or replace`). Contents:
  - Create the `profiles` table, enable RLS. Policies: select when `id = auth.uid() or is_admin()`. No insert, update or delete for clients (the backend uses the service key, which bypasses RLS).
  - `is_admin()` as specified above.
  - Add `gradings.worker_id` with its default.
  - Drop the policies `"anon insert"`, `"anon read"`, `"anon delete"` on `gradings` and `"anon upload gradings"`, `"anon read gradings"`, `"anon delete gradings"` on `storage.objects`.
  - `gradings` policies, all `to authenticated`:
    - insert: `with check (worker_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.active))`
    - select: `using (worker_id = auth.uid() or is_admin())`
    - delete: `using (is_admin())`
  - Storage: `update storage.buckets set public = false where id = 'gradings'`. Policies on `storage.objects` for bucket `gradings`, all `to authenticated`: insert for any authenticated user; select for an admin or when the object's name is the `image_path` or `back_image_path` of a grading the caller can see; delete for an admin.
  - Recreate the `inventory` view and create `worker_counts`, both `with (security_invoker = true)`.
  - Comment block at the end with the one-time manual steps: Auth → Providers → Email → turn off "Confirm email"; and the SQL that turns an existing auth user into the first admin: `insert into profiles (id, username, full_name, role) values ('<auth user id>', 'admin', 'Farm admin', 'admin');`

- [ ] **Step 4: Run `auth-roles.sql`, then `rls-check.sql`**

Expected: `RLS checks passed`, and no rows are left behind (rollback).

- [ ] **Step 5: Append `auth-roles.sql` to `schema.sql`** under a comment `-- Accounts and roles: the same statements as auth-roles.sql, included here for new projects.` Run `schema.sql` on a scratch project, or re-run it on the same one. Expected: no errors (it is idempotent).

- [ ] **Step 6: Checkpoint** (see Global Constraints).

---

### Task 2: Backend admin API for workers

**Files:**
- Create: `backend/grading/supabase_admin.py`
- Create: `backend/grading/admin.py`
- Create: `backend/tests/__init__.py`, `backend/tests/test_admin.py`
- Create: `backend/requirements-dev.txt` (`pytest==8.4.2`)
- Modify: `backend/requirements.txt` (add `httpx==0.28.1`)
- Modify: `backend/grading/config.py` (add `SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")`, `SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")`, `FARM_EMAIL_DOMAIN = "farm.local"`)
- Modify: `backend/main.py` (`app.include_router(admin_router)` next to the existing router)

**Interfaces:**
- Consumes: the `profiles` table from Task 1.
- Produces (used by Task 8):
  - `GET  /api/admin/workers` → `200 [Worker]`, ordered by `full_name`
  - `POST /api/admin/workers` body `{username, full_name, password}` → `201 Worker`
  - `PATCH /api/admin/workers/{id}` body `{active?: bool, password?: str}` → `200 Worker`
  - `Worker = {id: str, username: str, full_name: str, role: "admin"|"worker", active: bool, created_at: str}`
  - Every route requires `Authorization: Bearer <supabase access token>`. Errors: 401 missing or invalid token; 403 not an active admin; 400 validation or self-disable; 404 unknown id; 409 duplicate username; 503 Supabase not configured.
- `supabase_admin.py` (thin httpx wrappers, the only module that talks to Supabase; tests replace its functions):
  - `get_user(token: str) -> dict | None` → `GET {SUPABASE_URL}/auth/v1/user` with `apikey` + `Authorization: Bearer token`; None on 401
  - `get_profile(user_id: str) -> dict | None`
  - `list_profiles() -> list[dict]`
  - `username_taken(username: str) -> bool`
  - `create_auth_user(email: str, password: str) -> str` (returns id; `email_confirm: True`)
  - `delete_auth_user(user_id: str) -> None`
  - `update_auth_user(user_id: str, *, password: str | None = None, banned: bool | None = None) -> None` (`ban_duration` `"876000h"` / `"none"`)
  - `insert_profile(row: dict) -> dict`, `update_profile(user_id: str, fields: dict) -> dict`
  - Profile reads and writes go through PostgREST `{SUPABASE_URL}/rest/v1/profiles` with the service key.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_admin.py`, using `fastapi.testclient.TestClient(app)` and a `fake` fixture that monkeypatches every function in `grading.supabase_admin` with an in-memory dict of users and profiles. Tokens in the tests: `"admin-token"` → an active admin, `"worker-token"` → a worker, anything else → `get_user` returns None.
  - `test_list_requires_token`: no header → 401
  - `test_list_rejects_bad_token`: `Bearer nope` → 401
  - `test_list_forbidden_for_worker` → 403
  - `test_list_forbidden_for_disabled_admin` → 403
  - `test_create_worker`: admin posts `{"username": " Juan ", "full_name": "Juan Dela Cruz", "password": "secret123"}` → 201. Body has `username == "juan"`, `role == "worker"`, `active is True`. The fake saw `create_auth_user("juan@farm.local", "secret123")`.
  - `test_create_duplicate_username_any_case`: `juan` exists, post `JUAN` → 409 `"Username already taken"`, and `create_auth_user` was not called.
  - `test_create_rejects_bad_username`: `"ab"` and `"juan dela"` → 400
  - `test_create_rejects_short_password`: `"short"` → 400
  - `test_create_rolls_back_auth_user_when_profile_fails`: `insert_profile` raises → 500, and `delete_auth_user` was called with the new id
  - `test_disable_worker`: PATCH `{"active": false}` → 200 `active is False`, and the fake recorded `banned=True`
  - `test_enable_worker`: → `banned=False`
  - `test_reset_password`: PATCH `{"password": "newpass123"}` → 200, the fake recorded the password
  - `test_admin_cannot_disable_self`: PATCH own id `{"active": false}` → 400 `"You cannot disable your own account"`
  - `test_patch_unknown_id` → 404
  - `test_not_configured`: with `SUPABASE_URL` monkeypatched to `""` → 503

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd backend && .venv/Scripts/python -m pip install -r requirements.txt -r requirements-dev.txt && .venv/Scripts/python -m pytest tests -q`
Expected: collection error / failures (`grading.admin` missing).

- [ ] **Step 3: Implement `supabase_admin.py`** with the signatures above. Use one module-level `httpx.Client(timeout=10)`. Raise `RuntimeError(message)` on non-2xx responses, except that `get_user` returns None on 401/403.

- [ ] **Step 4: Implement `admin.py`**: `router = APIRouter(prefix="/api/admin")`, a dependency `require_admin(authorization: str | None = Header(None)) -> dict` that returns the caller's profile, and Pydantic models `NewWorker` and `WorkerPatch`. Call the module through `supabase_admin.<fn>` (not `from ... import fn`) so the monkeypatching works. Run blocking calls with `run_in_threadpool`, following `routes.py`.

- [ ] **Step 5: Wire the router into `main.py`** before the static catch-all.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `15 passed`.

- [ ] **Step 7: Smoke test against the real project.** Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, run `python -m uvicorn main:app --port 8000`, then `curl -H "Authorization: Bearer x" localhost:8000/api/admin/workers`. Expected: 401.

- [ ] **Step 8: Checkpoint.**

---

### Task 3: Frontend auth (store, login page, guards)

**Files:**
- Modify: `frontend/package.json` (devDependency `vitest@3.2.4`; script `"test": "vitest run"`)
- Create: `frontend/vitest.config.ts` (merges `vite.config`, `environment: 'node'`)
- Create: `frontend/src/utils/auth.ts`, `frontend/src/utils/__tests__/auth.test.ts`
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/router/index.ts` (login route, `meta.roles`, `beforeEach` guard)
- Modify: `frontend/src/App.vue` (no nav or sidebar padding on `/login`)

**Interfaces:**
- Produces:
  - `type Role = 'admin' | 'worker'` and `interface Profile { id: string; username: string; full_name: string; role: Role; active: boolean }` in `src/types/index.ts`
  - `utils/auth.ts`: `normalizeUsername(raw: string): string`, `isValidUsername(u: string): boolean`, `usernameToEmail(u: string): string`, `homeFor(role: Role): string` (`admin` → `/dashboard`, `worker` → `/scan`), `canVisit(role: Role | null, allowed: Role[] | undefined): boolean` (`allowed` undefined means public)
  - `useAuthStore()`: state `profile: Ref<Profile | null>`, `ready: Ref<boolean>`; getters `role`, `isAdmin`; actions `init(): Promise<void>` (reads the session, loads the profile, subscribes to `onAuthStateChange`; idempotent), `signIn(username: string, password: string): Promise<void>`, `signOut(): Promise<void>`, `accessToken(): Promise<string | null>`
  - Route meta: `roles?: Role[]`.

- [ ] **Step 1: Write the failing tests** in `utils/__tests__/auth.test.ts`:
  - `normalizeUsername('  Juan ')` → `'juan'`
  - `isValidUsername('juan.dc')` true; `'ab'`, `'juan dc'` and `'x'.repeat(33)` false
  - `usernameToEmail('juan')` → `'juan@farm.local'`
  - `homeFor('admin')` → `'/dashboard'`, `homeFor('worker')` → `'/scan'`
  - `canVisit(null, undefined)` true; `canVisit(null, ['worker'])` false; `canVisit('worker', ['admin'])` false; `canVisit('admin', ['admin'])` true

- [ ] **Step 2: Run** `cd frontend && npm install --legacy-peer-deps && npm test`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `utils/auth.ts`**, then run `npm test`. Expected: PASS.

- [ ] **Step 4: Implement `stores/auth.ts`.** `signIn` throws `Error('Wrong username or password.')` on an auth error, and `Error('This account is disabled. Ask the admin.')` when Supabase reports a banned user or the profile has `active = false` (sign out in that case). If the profile row is missing, sign out and throw `Error('This account has no role yet. Ask the admin.')`. When `supabase` is null, `signIn` throws `Error('Supabase is not configured.')`.

- [ ] **Step 5: Router.** Add `/login` (public, `meta.title: 'Sign in'`). Give every existing route `meta.roles` (`/grade`, `/review*`, `/history`, `/dashboard`, `/inventory` → `['admin']`). Change `/` and the catch-all to redirect to `/login`. `beforeEach`: `await auth.init()`. Signed in and going to `/login` → `homeFor(role)`. `!canVisit(role, to.meta.roles)` → signed out: `/login?next=<to.fullPath>`, signed in: `homeFor(role)`.

- [ ] **Step 6: `LoginView.vue`**: username + password fields, a submit button with a loading state, and the error shown in the existing `StateBlock` style. On success go to `next` (only when `canVisit` allows it), else `homeFor(role)`. Same visual language as the app (Card, brand colours, the pitaya mark from `AppNav`).

- [ ] **Step 7: Verify.** `npm test && npm run build` → both pass. Manual: `npm run dev`. Opening `/dashboard` signed out redirects to `/login?next=/dashboard`. The admin created in Task 1 can sign in and lands on `/dashboard`. A wrong password shows "Wrong username or password."

- [ ] **Step 8: Checkpoint.**

---

### Task 4: Inventory data layer (owner, counts, signed photos)

**Files:**
- Modify: `frontend/src/api/inventory.ts`
- Create: `frontend/src/utils/counts.ts`, `frontend/src/utils/__tests__/counts.test.ts`

**Interfaces:**
- Consumes: the `worker_counts` view and `gradings.worker_id` (Task 1).
- Produces:
  - `interface WorkerCountRow { worker_id: string | null; day: string /* YYYY-MM-DD */; maturity: string; quality: string; count: number }`
  - `Grading` gains `worker_id: string | null`
  - `getWorkerCounts(): Promise<WorkerCountRow[]>` (RLS decides which rows come back)
  - `getGradings(limit: number, offset: number, workerId?: string | null): Promise<Grading[]>` (`null` filters to unassigned rows, `undefined` means no filter)
  - `photoUrls(paths: string[]): Promise<Record<string, string>>` replaces `photoUrl`, using `createSignedUrls(paths, 3600)`
  - `utils/counts.ts`:
    - `manilaDay(d: Date): string` (YYYY-MM-DD in Asia/Manila, via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`)
    - `interface CountSummary { today: number; week: number; total: number; byBin: InventoryRow[]; daily: { day: string; count: number }[] }`
    - `summarize(rows: WorkerCountRow[], now: Date, days = 14): CountSummary`. `week` covers the last 7 Manila days including today. `daily` holds exactly `days` entries ending today, with zeros filled in.
    - `byWorker(rows: WorkerCountRow[], now: Date): Map<string | null, CountSummary>`

- [ ] **Step 1: Write the failing tests** in `counts.test.ts`:
  - `manilaDay(new Date('2026-10-25T15:30:00Z'))` → `'2026-10-25'`; `manilaDay(new Date('2026-10-25T16:30:00Z'))` → `'2026-10-26'`
  - with `now = new Date('2026-10-25T02:00:00Z')` and rows of `day '2026-10-25'` count 3, `'2026-10-20'` count 2, `'2026-10-10'` count 5: `today 3`, `week 5`, `total 10`
  - `daily` has length 14, its last entry is `{ day: '2026-10-25', count: 3 }`, and missing days are 0
  - `byBin` sums the same maturity+quality across days
  - `byWorker` keeps `null` (unassigned) as its own key

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement `utils/counts.ts`.** Run `npm test`. Expected: PASS.

- [ ] **Step 4: Update `api/inventory.ts`.** Add `getWorkerCounts` and the `workerId` filter, select `worker_id` in `getGradings`, and replace `photoUrl` with `photoUrls`. Drop the column-fallback shortcut in `getGradings`, since `auth-roles.sql` requires the photo columns anyway. Change the "Nothing was deleted" message to `'Nothing was deleted. Only the admin can delete, and auth-roles.sql must be run in Supabase.'`. Update `InventoryView.vue` to load signed URLs when a fruit is selected (this replaces its two `photoUrl` calls).

- [ ] **Step 5: Verify.** `npm test && npm run build` → pass. Manual as admin: `/inventory` still lists fruit, opening one shows both photos (signed URLs), and delete still works.

- [ ] **Step 6: Checkpoint.**

---

### Task 5: Role-based navigation and moving the model metrics

**Files:**
- Rename: `frontend/src/views/DashboardView.vue` → `frontend/src/views/ModelMetricsView.vue` (`git mv`; the page header title becomes "Model metrics")
- Modify: `frontend/src/router/index.ts` (`/model` → `ModelMetricsView`, `meta: { title: 'Model metrics', roles: ['admin'] }`)
- Modify: `frontend/src/components/AppNav.vue`

**Interfaces:**
- Consumes: `useAuthStore()` (Task 3).
- Produces: nav groups by role.
  - Admin: **Monitoring** (Dashboard `/dashboard`, Inventory `/inventory`, Workers `/workers`) · **Tools** (Quick grade `/grade`) · **Expert review** (Review queue `/review`, History `/history`, Model metrics `/model`)
  - Worker: Scan `/scan`, My dashboard `/my-dashboard`
  - Both roles: a footer in the sidebar with the user's `full_name` and a "Sign out" button. On mobile, a sign-out icon in the header area of each worker page is enough. Put it in `PageHeader` as an optional slot only if it is needed; do not add a sixth bottom-bar item for the admin. The admin's mobile bar shows Dashboard, Inventory, Workers, Grade, Review.

- [ ] **Step 1: Rename the view and add `/model`.** Temporarily point `/dashboard` at `ModelMetricsView` until Task 7 replaces it. Point `/workers`, `/scan` and `/my-dashboard` at a placeholder until their tasks land: use `QuickGradeView` for `/scan` (Task 6 adapts it), and for the other two a one-line `StateBlock` "Coming soon" component inline in the route (`{ render: () => h(StateBlock, ...) }`).

- [ ] **Step 2: Make `AppNav.vue` build `groups` from `auth.role`** and add the sign-out footer. Sign-out calls `auth.signOut()` then `router.push('/login')`.

- [ ] **Step 3: Verify.** `npm run build` → pass. Manual: the admin sees three groups, and `/model` shows the old metrics. A worker account (create one with SQL for now, or wait for Task 8) sees only Scan and My dashboard, and typing `/inventory` redirects to `/scan`.

- [ ] **Step 4: Checkpoint.**

---

### Task 6: Worker scan and My dashboard

**Files:**
- Modify: `frontend/src/views/QuickGradeView.vue`
- Create: `frontend/src/views/MyDashboardView.vue`
- Create: `frontend/src/components/CountTiles.vue`, `frontend/src/components/DailyChart.vue`, `frontend/src/components/BinBreakdown.vue`
- Modify: `frontend/src/router/index.ts` (`/scan` → `QuickGradeView` with `meta: { title: 'Scan', roles: ['worker'] }`; `/my-dashboard` → `MyDashboardView`, `roles: ['worker']`)

**Interfaces:**
- Consumes: `useAuthStore().isAdmin`, `getWorkerCounts`, `summarize`, `CountSummary` (Tasks 3, 4), `buildBins` (`utils/bins.ts`), `ChartCanvas`.
- Produces (reused by Task 7):
  - `CountTiles` props `{ summary: CountSummary }`: three tiles, Today / This week / Total.
  - `DailyChart` props `{ daily: CountSummary['daily'] }`: bar chart through `ChartCanvas`.
  - `BinBreakdown` props `{ rows: InventoryRow[] }`: the maturity × quality bins, following the InventoryView bin cards. Move that markup here and use this component in `InventoryView` too, so it is not duplicated.

- [ ] **Step 1: Simplify `QuickGradeView` for workers.** When `!auth.isAdmin`, hide `HeatmapViewer`, `NeighborStrip`, the per-side disagreement details and any expert-only panels. Keep: capture front/back → verdict (bin + action) → "Saved" confirmation → a "Scan next fruit" button that resets the form. The page title is "Scan" for workers and "Quick grade" for the admin. Map the RLS insert error for a disabled worker (`new row violates row-level security policy`) to `'Your account is disabled. This fruit was not saved.'`.

- [ ] **Step 2: Build `CountTiles`, `DailyChart`, `BinBreakdown`**, and switch `InventoryView` to `BinBreakdown`.

- [ ] **Step 3: `MyDashboardView`.** Load with `getWorkerCounts()`, then `summarize(rows, new Date())`. Show CountTiles, DailyChart (14 days) and BinBreakdown(`summary.byBin`). Add a refresh button with an "Updated <time>" label like the old dashboard. Empty state: "No scans yet. Go to Scan to grade your first fruit." with a link to `/scan`.

- [ ] **Step 4: Verify.** `npm test && npm run build` → pass. Manual as a worker: scan two fruit (both saved), then My dashboard shows Today 2 and Total 2. Then as a second worker: My dashboard shows 0. Then disable worker 1 in the Supabase table (`active = false`) without signing them out: their next scan shows the disabled message and no row is added.

- [ ] **Step 5: Checkpoint.**

---

### Task 7: Admin inventory dashboard and inventory worker filter

**Files:**
- Create: `frontend/src/views/DashboardView.vue` (new content)
- Create: `frontend/src/api/profiles.ts`
- Modify: `frontend/src/views/InventoryView.vue`
- Modify: `frontend/src/router/index.ts` (`/dashboard` → the new `DashboardView`, `meta: { title: 'Dashboard', roles: ['admin'] }`)

**Interfaces:**
- Consumes: `getInventory`, `getWorkerCounts`, `byWorker`, `summarize`, `CountTiles`, `DailyChart`, `BinBreakdown` (Tasks 4, 6).
- Produces: `profiles.ts` → `listProfiles(): Promise<Profile[]>` (reads `profiles` directly; RLS lets the admin read all). The inventory page reads the query param `?worker=<uuid>|unassigned`.

- [ ] **Step 1: `DashboardView`.**
  - Top: CountTiles over all rows (`summarize(allRows, now)`).
  - Then DailyChart (14 days, all workers) and BinBreakdown (from `getInventory()`).
  - Then the **Workers** table: one row per worker profile, plus "Unassigned" if `byWorker` has a `null` key. Columns: Name (+ "disabled" badge), Today, This week, Total, and a link "View fruit" → `/inventory?worker=<id>` (or `unassigned`). Workers with 0 scans are still listed. Sort by Today desc, then Total desc.
  - A refresh button with "Updated <time>", as in the old dashboard.

- [ ] **Step 2: `InventoryView` worker filter.** Add a worker select (All / each profile / Unassigned) bound to the `worker` query param, and pass it to `getGradings`. Add a "Worker" field to each fruit tile and to the detail dialog (`full_name`, or "Unassigned").

- [ ] **Step 3: Verify.** `npm run build` → pass. Manual as admin, after the Task 6 scans: Dashboard Total = sum of all fruit, the Workers table shows worker 1 with 2 and worker 2 with 0, and older data shows as Unassigned. "View fruit" opens `/inventory?worker=…`, which lists only that worker's fruit.

- [ ] **Step 4: Checkpoint.**

---

### Task 8: Workers management page

**Files:**
- Create: `frontend/src/api/workers.ts`
- Create: `frontend/src/views/WorkersView.vue`
- Modify: `frontend/src/api/http.ts` (`request` accepts an optional `token`, sent as `Authorization: Bearer`)
- Modify: `frontend/src/router/index.ts` (`/workers` → `WorkersView`, `meta: { title: 'Workers', roles: ['admin'] }`)

**Interfaces:**
- Consumes: the backend API from Task 2, `useAuthStore().accessToken()`, and `normalizeUsername` / `isValidUsername` (Task 3).
- Produces: `workers.ts` → `listWorkers(): Promise<Profile[]>`, `createWorker(input: { username: string; full_name: string; password: string }): Promise<Profile>`, `setWorkerActive(id: string, active: boolean): Promise<Profile>`, `resetWorkerPassword(id: string, password: string): Promise<Profile>`. Each throws `ApiError` with the backend's `detail` text as its message (parse the JSON `{detail}` that FastAPI returns).

- [ ] **Step 1: `http.ts` + `workers.ts`.** Add the token support without changing existing callers' behaviour.

- [ ] **Step 2: `WorkersView`.**
  - A table of accounts: name, username, role, status, created date.
  - An "Add worker" dialog (full name, username, password + show/hide). Client-side checks use the Global Constraints rules and show the same messages as the backend.
  - Per row: Disable/Enable (with a confirm dialog) and "Reset password" (a dialog with a new password).
  - The admin's own row has no Disable button.
  - After creating, show the credentials once ("Give these to the worker: username …, password …") with a copy button.

- [ ] **Step 3: Verify.** `npm run build` → pass. Manual with the backend running (`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set):
  - Create `juan` / `secret123`. Signing in as juan in a private window works immediately (no email), and juan lands on `/scan`.
  - Creating `JUAN` shows "Username already taken".
  - Disabling juan: juan's next sign-in shows "This account is disabled. Ask the admin."
  - Reset the password, then the new one works.

- [ ] **Step 4: Checkpoint.**

---

### Task 9: Docs and final verification

**Files:**
- Modify: `README.md` (pages by role, the new env vars, the one-time Supabase setup, how to create the first admin, how to run the backend tests)
- Modify: `frontend/.env.example` (comment that the service key never goes here)
- Create: `backend/.env.example` (`SUPABASE_URL=`, `SUPABASE_SERVICE_KEY=`, `CORS_ORIGINS=`)
- Modify: `fly.toml` / `Dockerfile` only if they list env vars (document the `fly secrets set SUPABASE_SERVICE_KEY=...` command in the README instead of committing a value)

- [ ] **Step 1: Write the docs.** The README's "Pages" line becomes two lists: Admin (`/dashboard`, `/inventory`, `/workers`, `/grade`, `/review`, `/history`, `/model`) and Worker (`/scan`, `/my-dashboard`).

- [ ] **Step 2: Full verification.** `cd backend && .venv/Scripts/python -m pytest tests -q` → all pass. `cd frontend && npm test && npm run build && npm run lint` → pass. Re-run `rls-check.sql` → `RLS checks passed`. Grep the frontend for leaked service keys: `grep -rn "SERVICE" frontend/src frontend/.env*` → no matches.

- [ ] **Step 3: End-to-end walkthrough:** admin creates a worker → worker scans 2 fruit → worker dashboard shows 2 → a second worker sees 0 → admin dashboard shows both workers and the totals → admin deletes one fruit → the worker's total drops to 1.

- [ ] **Step 4: Checkpoint.** Then use `superpowers:finishing-a-development-branch`.
