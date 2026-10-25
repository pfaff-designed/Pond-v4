-- ─── Favourite pages: a per-person, per-pond shortcut list (KAN-475) ──────────
--
-- Why: the "get around" journey review (2026-10-17) found the pages people use
-- most are as deep in the tree as everything else; Notion's Favorites section
-- (Mobbin flow 66561071) is the reference. A favourite is a shortcut, not a
-- move — the page keeps its place in the tree, and this column only records
-- which of a pond's pages also show in the pinned band above it.
--
-- `favourite_page_ids` lives on `ponds`, not `pages`: a favourite is a fact
-- about the pond's rail (per person per pond, since ponds are per-user), not a
-- property of the page itself. NULL means none — the column is additive and
-- optional, so every existing pond row reads unchanged and the band simply
-- doesn't render (reversibility). No default array is set, matching
-- `last_page_id`'s nullable shape on this same table rather than
-- `recent_glyphs`'s `not null default '{}'`, since there is no equivalent
-- "always has a value" invariant here.
--
-- Order matters: a new favourite appends at the end (this ticket); drag-to-
-- reorder within the band lands in a later ticket. So this is a plain
-- `uuid[]`, not a set.
--
-- Ids that no longer resolve to a live page in this pond (trashed, deleted, or
-- never existed) are filtered at read time by the client, not rewritten here
-- — no data rewrite, no FK: a page can be hard-deleted (0027's trash is itself
-- a soft `pages` state) without this migration needing to cascade or null
-- anything out.
--
-- No RLS change: 0018's "ponds: update own" policy is `using (auth.uid() =
-- user_id) with check (auth.uid() = user_id)` — column-agnostic, so it already
-- covers writes to this new column; only a pond's own owner can set their
-- favourites.
--
-- Down (manual):
--   alter table public.ponds drop column if exists favourite_page_ids;

begin;

alter table public.ponds
  add column if not exists favourite_page_ids uuid[] null;

comment on column public.ponds.favourite_page_ids is
  'This pond''s favourited page ids, in band order, newest additions last. NULL = none.';

commit;
