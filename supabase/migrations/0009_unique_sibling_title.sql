-- ── Unique sibling page names (issue #84) ────────────────────────────────────
--
-- Two parts, in order:
--   1) DEDUPE existing rows. Duplicate area/page rows have accumulated (repeated
--      seeding + create paths with no uniqueness guard), so the workspace shows
--      empty "twin" areas next to the real one. We collapse each group of
--      same-named siblings onto a single canonical keeper — reparenting the
--      losers' children onto the keeper first (no content loss), then deleting
--      the now-empty losers.
--   2) UNIQUE INDEX enforcing "no two siblings share a name" going forward.
--
-- Why COALESCE(parent_id, sentinel): parent_id is nullable (null = top-level).
-- Postgres treats NULLs as DISTINCT in a unique index, so a plain
-- UNIQUE(user_id, workspace, parent_id, lower(title)) would NOT catch duplicate
-- ROOT rows — which is exactly where the duplicate areas live. Folding null to a
-- fixed sentinel uuid makes root siblings compare equal. Titles are compared
-- case-insensitively and whitespace-trimmed (lower(btrim(title))), matching the
-- application helper in src/lib/pages/dedupe-title.ts.
--
-- Keeper per group = most children first, then oldest created_at, then lowest id
-- (deterministic). The two dedupe statements are self-contained (their own WITH
-- clauses) because a CTE isn't visible to a later statement; the child_count
-- subquery and window partition are identical between them so the keeper is
-- stable across the reparent→delete pair.
--
-- Assumption: reparenting a loser's children onto the keeper does not itself
-- create a fresh same-named collision under the keeper. Verified against the
-- current data (the only content-bearing merges are Personal←Kitchen Remodel and
-- Health←Lose 40 lbs, both unique under their keepers). Were that ever violated,
-- the unique index below would fail loudly rather than silently corrupt.

begin;

-- 1) Reparent children of non-keeper duplicates onto the group's keeper.
with grp as (
  select
    p.id,
    p.user_id,
    p.workspace,
    coalesce(p.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) as pkey,
    lower(btrim(p.title)) as tkey,
    (select count(*) from public.pages c where c.parent_id = p.id) as child_count,
    p.created_at
  from public.pages p
  where btrim(p.title) <> ''
),
ranked as (
  select
    id,
    first_value(id) over (
      partition by user_id, workspace, pkey, tkey
      order by child_count desc, created_at asc, id asc
    ) as keeper_id
  from grp
),
losers as (
  select id, keeper_id from ranked where id <> keeper_id
)
update public.pages c
set parent_id = l.keeper_id, updated_at = now()
from losers l
where c.parent_id = l.id;

-- 2) Delete the now-empty losers (recompute the same ranking — see header note).
with grp as (
  select
    p.id,
    p.user_id,
    p.workspace,
    coalesce(p.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) as pkey,
    lower(btrim(p.title)) as tkey,
    (select count(*) from public.pages c where c.parent_id = p.id) as child_count,
    p.created_at
  from public.pages p
  where btrim(p.title) <> ''
),
ranked as (
  select
    id,
    first_value(id) over (
      partition by user_id, workspace, pkey, tkey
      order by child_count desc, created_at asc, id asc
    ) as keeper_id
  from grp
)
delete from public.pages p
using ranked r
where p.id = r.id and r.id <> r.keeper_id;

-- The reparent above touches the DEFERRABLE INITIALLY DEFERRED parent_id FK, so
-- its trigger events are still pending inside this transaction. CREATE INDEX
-- refuses to run with pending trigger events ("cannot CREATE INDEX ... because it
-- has pending trigger events") — force the deferred checks to resolve now.
set constraints all immediate;

-- 3) Enforce sibling-name uniqueness going forward. PARTIAL on non-blank titles:
-- blank/untitled placeholders (new pages, collection rows) are legitimately
-- duplicated among siblings, so only meaningful names are constrained. The
-- dedupe above likewise skips blank titles (see the `btrim(title) <> ''` filter).
create unique index if not exists pages_sibling_title_uniq
  on public.pages (
    user_id,
    workspace,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(title))
  )
  where btrim(title) <> '';

commit;
