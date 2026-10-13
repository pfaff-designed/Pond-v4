-- ─── First run: a once-only flag for the empty-shell hints (KAN-195) ─────────
--
-- `public.users` has been SELECT-only for the client since 0012 (#145) — no
-- UPDATE or DELETE policy, and this migration does not add one. The flag is
-- set through a narrow SECURITY DEFINER function instead, the same shape the
-- `private` schema's helpers use: it runs as the table owner (bypassing RLS),
-- reads `auth.uid()` for who it is acting on, and exposes nothing wider than
-- "stamp my own row, once."
--
-- Idempotent by construction: `coalesce(first_run_done_at, now())` keeps the
-- first timestamp on every later call, so a double-send of the make-page
-- proposal (or a retried RPC) never moves it.
--
-- Down (manual, if ever needed):
--   revoke all on function public.mark_first_run_done() from authenticated;
--   drop function if exists public.mark_first_run_done();
--   alter table public.users drop column if exists first_run_done_at;

begin;

alter table public.users
  add column if not exists first_run_done_at timestamptz null;

create or replace function public.mark_first_run_done()
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
  set first_run_done_at = coalesce(first_run_done_at, now())
  where id = auth.uid();
$$;

revoke all on function public.mark_first_run_done() from public;
grant execute on function public.mark_first_run_done() to authenticated;

commit;
