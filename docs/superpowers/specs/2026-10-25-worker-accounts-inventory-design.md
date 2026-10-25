# Worker accounts and inventory monitoring - design

Date: 2026-10-25 · Status: awaiting user review

## Goal
Restructure the app so that:
- **Admin** monitors the inventory of scanned dragon fruit, including a per-worker breakdown.
- **Workers** (farm staff) each have their own account. Their only use case is scanning fruit, and they have a dashboard counting their own scans.
- A worker sees only their own data. The admin sees everyone's.

## Decisions (from the user)
- The existing expert-review pages (review queue, expert review, history, model metrics) are kept, **admin-only**.
- The admin creates worker accounts inside the app.
- No email confirmation. A worker logs in with **username + password** only.

## Approach
Supabase Auth + a `profiles` table + Row Level Security. A small admin-only FastAPI endpoint creates and manages workers using the Supabase service-role key. Chosen over a hand-rolled auth (insecure, more code) and over an Edge Function (new tooling).

## 1. Data (Supabase)
- `profiles(id uuid pk -> auth.users, username text unique, full_name text, role text check in ('admin','worker'), active bool default true)`.
- `gradings.worker_id uuid references profiles(id) default auth.uid()`. Existing rows keep `worker_id = null` and show as "Unassigned".
- Drop the anon policies on `gradings` and on the `gradings` storage bucket.
- RLS on `gradings`: worker can `insert` (with `worker_id = auth.uid()`) and `select` own rows; admin can `select` and `delete` all. A disabled worker (`active = false`) cannot insert.
- Storage bucket `gradings` becomes private; reads use signed URLs. Authenticated users may upload; admin may delete.
- Views (`security_invoker`): `inventory` (maturity, quality, count) and `worker_counts` (worker_id, day, maturity, quality, count). RLS makes each worker see only their own rows.
- Helper `is_admin()` (security definer) used by the policies.
- Migration file: `frontend/supabase/auth-roles.sql`; `schema.sql` is updated for new projects.

## 2. Authentication without email
- Supabase dashboard: disable "Confirm email".
- Username -> `username@farm.local` before calling `signInWithPassword`. The address is never mailed.
- The backend creates users with `email_confirm: true`, so a new worker can log in immediately.
- There is no email password reset. The admin resets the password in `/workers`.
- The first admin is created once by hand (SQL/dashboard); documented in the README.

## 3. Backend (FastAPI)
- New `backend/grading/admin.py`, routes under `/api/admin/workers`: `GET` (list), `POST` (create: username, full name, password), `PATCH /{id}` (disable/enable, reset password).
- Each request verifies the caller's Supabase access token by calling Supabase `GET /auth/v1/user` (works with both legacy and asymmetric JWT keys), loads their profile, and requires `role = 'admin'` and `active` (401 / 403 otherwise).
- Uses `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (secret, backend env only).
- Existing grading endpoints (`predict` etc.) are unchanged.

## 4. Frontend
- `/login` (username, password). An auth store holds the session and role; router guards redirect to `/login` when signed out and to the user's home on a wrong role.
- **Worker** (nav: Scan, My dashboard):
  - `/scan`: the quick-grade flow reduced to front + back photo -> result -> save. No heatmap, neighbors or expert tools.
  - `/my-dashboard`: counts for today / this week / total, a maturity x quality breakdown, and a daily chart. Own data only.
- **Admin:**
  - `/dashboard`: inventory monitoring - total scanned, maturity/quality breakdown, trend chart, and a per-worker table (name, today, week, total) that links to that worker's fruit.
  - `/inventory`: the current fruit list plus a worker column and filter, and delete.
  - `/workers`: create, disable/enable, reset password.
  - `/review`, `/review/:id`, `/history`, and `/model` (the current dashboard's model metrics moved here): grouped under "Expert review".
- `recordGrading` stops sending an anonymous insert; it relies on `worker_id` defaulting to `auth.uid()`.

## 5. Errors and testing
- Clear messages for: wrong username/password, disabled account, duplicate username, expired session, missing Supabase config.
- RLS checks (SQL): worker A cannot read or insert as worker B; a disabled worker cannot insert; only admin can delete.
- Backend tests for `/api/admin/workers`: 401 without a token, 403 for a worker, 201 for an admin.
- `npm run build` (vue-tsc) and a manual walkthrough of both roles.

## Out of scope
Self sign-up, email-based reset, multiple farms/teams, offline mode, requiring a JWT on the grading endpoints (possible follow-up).
