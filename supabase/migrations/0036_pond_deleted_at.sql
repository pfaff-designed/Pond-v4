-- ─── Soft-deleting a pond: a 30-day grace period (KAN-493) ─────────────────
--
-- Why: AUDIT 6m decided a deleted pond waits 30 days under "deleted" in
-- settings › ponds, with a restore, rather than vanishing immediately. A
-- timestamp is the fact the countdown reads from; permanent removal after the
-- 30 days is a separate one-way ticket and is NOT built here.
--
-- NULL = live (today's behaviour, unchanged) — additive and optional, so
-- applying this migration soft-deletes nothing and every existing pond row
-- reads as live. The app, not this migration, is responsible for treating a
-- row with `deleted_at` set as gone from every live-pond read (listPonds, the
-- switcher, ⌘K rows, `?pond=` resolution).
--
-- No RLS change: 0018's "ponds: update own" policy is `using (auth.uid() =
-- user_id) with check (auth.uid() = user_id)` — column-agnostic, so it
-- already covers an owner setting or clearing this column. There remains no
-- DELETE policy on this table (0018): soft delete is a plain UPDATE, which is
-- the whole point of a timestamp column instead of a real delete.
--
-- Down (manual):
--   alter table public.ponds drop column if exists deleted_at;

begin;

alter table public.ponds
  add column if not exists deleted_at timestamptz null;

comment on column public.ponds.deleted_at is
  'When this pond was soft-deleted. NULL = live. Purged 30 days after, by a separate ticket.';

commit;
