-- ─── A pond is genuinely empty: per-pond roots and sibling names (#312) ──────
--
-- 0018 added the pond record and the key but left both user-keyed unique indexes
-- in place, because `pond_id` was nullable and re-keying them would have silently
-- disabled them (NULLs are distinct in a unique index, and every insert omitted
-- `pond_id`). The pond-keyed equivalents were added alongside and have been
-- holding since.
--
-- Now the app stamps `pond_id` on every write and reads scoped by it, so the old
-- pair is what stands in the way: `pages_one_home_per_user` forbids a SECOND root
-- row, which is exactly what a new pond needs. Until this migration a new pond
-- could not have its own root, so it showed the first pond's pages.
--
-- Safe because the replacements already exist and already constrain the same
-- shapes per pond:
--   * `pages_one_root_per_pond`        (0018) — one `type='home'` row per pond
--   * `pages_sibling_title_pond_uniq`  (0018) — sibling titles unique per pond
--
-- `pond_id` stays nullable for now — see the note further down. The assertion
-- below still refuses to proceed over unstamped rows, because once the user-keyed
-- indexes are gone, a row with a null `pond_id` is constrained by nothing.
--
-- Down (manual, if ever needed):
--   begin;
--   create unique index pages_one_home_per_user on public.pages (user_id)
--     where type = 'home';
--   create unique index pages_sibling_title_uniq on public.pages
--     (user_id, workspace,
--      coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
--      lower(btrim(title))) where btrim(title) <> '';
--   commit;
--   -- NOTE: the first index will ABORT if any user already has two roots, which
--   -- is the point of this migration. Delete the extra ponds first.

begin;

-- Refuse to tighten over a partial backfill. 0018's own assertion covered the
-- rows that existed then; this covers anything written between the two.
do $$
declare n bigint;
begin
  select (select count(*) from public.pages         where pond_id is null)
       + (select count(*) from public.conversations where pond_id is null)
       + (select count(*) from public.change_log    where pond_id is null)
       + (select count(*) from public.templates     where pond_id is null)
    into n;
  if n > 0 then
    raise exception
      '% rows have a null pond_id. Re-run 0018''s backfill before tightening.', n;
  end if;
end $$;

-- The two user-keyed indexes go; their per-pond replacements from 0018 stay.
drop index if exists public.pages_one_home_per_user;
drop index if exists public.pages_sibling_title_uniq;

-- NOT done here: `set not null`. The app now always supplies `pond_id`
-- (`createPage` and `getOrCreateHomePage` both resolve one, falling back to the
-- person's first pond), but the pglite suite writes pages with raw SQL and would
-- need every fixture updated — 76 tests. That is its own slice. The assertion
-- above is what makes the index swap below safe in the meantime: it proves no row
-- is currently unstamped, and an unstamped row would escape the pond-keyed unique
-- index entirely once the user-keyed one is gone.

-- NOT done here: adding `pond_id` to `change_log_append_only()`'s frozen
-- identity list. That needs `create or replace` with 0011's ENTIRE body — the FK
-- clearing rules, the before/after redaction limits, the `transitions` tail-only
-- check and the `status_at` guard, ~170 lines — and restating it from anything
-- less than the original is how those protections get silently dropped. When it
-- is done, copy 0011's body verbatim and add the one clause. A record moving
-- between ponds is not currently reachable from the app: nothing writes
-- `change_log.pond_id` after insert.

commit;
