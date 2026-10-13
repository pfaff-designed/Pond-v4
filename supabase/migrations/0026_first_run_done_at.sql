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
-- Backfill: every existing account's flag starts null, which would replace an
-- established person's Life page with the empty-shell hints on deploy. A
-- person who already owns any page other than their reserved home row
-- (`type = 'home' and parent_id is null`, one per pond — see lib/pages/home.ts)
-- has clearly been through first run already, so they're backfilled done. A
-- person with only the auto-made home row(s) stays null and sees first run.
--
-- Down (manual, if ever needed):
--   revoke all on function public.mark_first_run_done() from authenticated;
--   drop function if exists public.mark_first_run_done();
--   alter table public.users drop column if exists first_run_done_at;

begin;

alter table public.users
  add column if not exists first_run_done_at timestamptz null;

update public.users u
set first_run_done_at = now()
where u.first_run_done_at is null
  and exists (
    select 1 from public.pages p
    where p.user_id = u.id
      and not (p.type = 'home' and p.parent_id is null)
  );

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
