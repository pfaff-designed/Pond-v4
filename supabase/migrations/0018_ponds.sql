-- ─── Multi-pond: the `ponds` table and the tenancy key (#312, #314) ──────────
--
-- A pond is an instance of the shell. One person may have several, and nothing
-- crosses between them — `Pond 06.13` `s6m5`: "pages, databases, memory, threads
-- and the change log are per pond. Nothing crosses over."
--
-- This migration adds the pond record and the key. It does NOT make the key
-- mandatory and it does NOT change behaviour: every existing query still filters
-- `user_id` (and `workspace`) and keeps working untouched. Threading `pond_id`
-- through the data-access layer is #318's tracker; this is the substrate it needs.
--
-- DECISIONS THIS ENCODES (all settled on #312 — do not re-litigate here):
--   * #313 — the active pond rides in the URL as `?pond=<id>`. Nothing here.
--   * #314 — `pond_id` stays NULLABLE in this migration. Every insert site in the
--     app omits it today (`pages/client.ts:225-247`, `home.ts:61-74`,
--     `conversation/client.ts:47`, `change-log/store.ts`, `templates/client.ts`),
--     so `not null` would break every write path. A later migration tightens it
--     once #318's children make every insert supply it.
--   * #315 — the sandbox BECOMES a pond. `life` for every user; `sandbox` only for
--     users who actually have sandbox rows (an empty second pond nobody made is
--     the phantom content #320 forbids). `workspace` is left in place and goes in
--     a later migration.
--   * #317 — the first-run flag belongs to the PERSON, not the pond. No
--     hints-seen column here.
--   * #320 — a pond is born with one row, its root, titled with the pond's name.
--     `life`'s root already exists and already carries that title.
--   * The map's RLS decision — the existing `auth.uid() = user_id` policies on
--     the four tables are UNTOUCHED. Pond isolation is a query filter with no
--     database backstop; that cost is accepted and recorded on #312.
--
-- DELIBERATELY NOT DONE HERE, each for a stated reason:
--   * No root page for the sandbox pond. Today there is exactly ONE `type='home'`
--     row per user and it lives in `workspace='main'`: `getOrCreateHomePage`
--     neither sets nor filters `workspace` (`src/lib/pages/home.ts:61-74`,
--     `:97-104`). Creating a second home row now would let that pond-blind
--     `readHomeRow` return the wrong root and silently replace a person's home
--     page with an empty one. It cannot be made pond-aware until `?pond=` exists
--     (#313's build child), so the sandbox pond's root arrives with that slice.
--   * `pond_id` is NOT added to `change_log_append_only()`'s frozen list. The
--     backfill below is itself an update of `pond_id`; freezing it first would
--     make this migration raise `restrict_violation`. Freeze it in the migration
--     that sets `not null`, after no further backfill can run.
--   * `seed_default_pages` / `seed_sandbox_pages` and the `Rail.tsx:993` effect
--     that calls them are untouched. They insert rows with a null `pond_id`,
--     which no query filters on yet, so nothing breaks — but they contradict
--     #320's one-row-at-birth rule and must be deleted before a pond can be
--     created in the app.
--   * Neither existing unique index is DROPPED. `pages_one_home_per_user` (0006)
--     and `pages_sibling_title_uniq` (0009) both stay and keep holding; the
--     pond-keyed equivalents are added beside them. See section 4 — re-keying
--     while `pond_id` is nullable would silently disable both constraints.
--   * `pages.type` still admits 'project', 'routine', 'action'. Vestigial, not
--     this migration's business.
--
-- Down (manual, if ever needed):
--   begin;
--   drop index if exists public.pages_sibling_title_pond_uniq;
--   drop index if exists public.pages_one_root_per_pond;
--   alter table public.pages         drop column if exists pond_id;
--   alter table public.conversations drop column if exists pond_id;
--   alter table public.change_log    drop column if exists pond_id;
--   alter table public.templates     drop column if exists pond_id;
--   drop table if exists public.ponds;
--   -- and restore 0001's handle_new_user body (it only inserts public.users).
--   commit;

begin;

-- ─── 1. The pond record ──────────────────────────────────────────────────────
-- `theme` admits all eight values `Pond 06.13` `s6m2` draws. #316 ships the theme
-- control DISABLED with only paper and ink reachable until #175 builds the other
-- six, but the board governs the stored domain; the disabled control governs the
-- UI. `glyph` has NO default on purpose: `s6m2`'s skip path says "the first
-- glyph", and which glyph that is is still unsettled (`glyph-library.ts`'s first
-- entry disagrees with the board's own row), so the app supplies it rather than
-- this migration baking in a contested value.
create table if not exists public.ponds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null default 'untitled pond',
  glyph text,
  theme text not null default 'paper'
    check (theme in ('paper', 'ink', 'sage', 'mist', 'navy', 'wheat', 'burnt-orange', 'ember')),
  "order" int not null default 0,
  -- `s6m6`: "the page you left stays open for when you come back." A URL states
  -- where you are, not where you were, so the pond remembers its own last page.
  last_page_id uuid references public.pages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ponds_user_order_idx on public.ponds (user_id, "order");

alter table public.ponds enable row level security;

-- Narrow policies, never `for all` (#145's lesson, and 0012's pattern).
-- There is deliberately NO delete policy: deleting a pond is not in scope on
-- #312 and is recorded there as fog. Until it is designed, a client cannot
-- attempt one.
drop policy if exists "ponds: read own" on public.ponds;
drop policy if exists "ponds: insert own" on public.ponds;
drop policy if exists "ponds: update own" on public.ponds;

create policy "ponds: read own" on public.ponds
  for select using (auth.uid() = user_id);
create policy "ponds: insert own" on public.ponds
  for insert with check (auth.uid() = user_id);
create policy "ponds: update own" on public.ponds
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── 2. The tenancy key, nullable ────────────────────────────────────────────
-- `conversations`, `change_log` and `templates` carry no page reference, so none
-- of them can derive a pond: each needs the column explicitly.
alter table public.pages         add column if not exists pond_id uuid references public.ponds(id) on delete cascade;
alter table public.conversations add column if not exists pond_id uuid references public.ponds(id) on delete cascade;
alter table public.change_log    add column if not exists pond_id uuid references public.ponds(id) on delete cascade;
alter table public.templates     add column if not exists pond_id uuid references public.ponds(id) on delete cascade;

-- `cascade`, not `restrict`, on change_log: account deletion runs
-- auth.users → public.users → ponds → change_log, and
-- `change_log_append_only()` exempts a delete whose `auth.users` row is already
-- gone (0011:151-170). `restrict` would make accounts undeletable. The same
-- trigger means deleting a pond that HAS history raises, which is the correct
-- state for a question #312 has not answered.
create index if not exists pages_pond_idx         on public.pages (pond_id);
create index if not exists conversations_pond_idx on public.conversations (pond_id);
create index if not exists change_log_pond_idx    on public.change_log (pond_id);
create index if not exists templates_pond_idx     on public.templates (pond_id);

-- ─── 3. Backfill ─────────────────────────────────────────────────────────────
-- Keyed through a temp table built from `returning`, NOT by joining on
-- `(user_id, name)`: `ponds.name` is deliberately not unique (skipping the create
-- sheet twice must be allowed to give two "untitled pond"s), so a name join is
-- not provably unambiguous on a replay.
create temporary table pond_map (
  user_id   uuid not null,
  workspace text not null,
  pond_id   uuid not null
) on commit drop;

-- 3a. `life`, for every user who has not already got one from a previous run.
with ins as (
  insert into public.ponds (user_id, name, glyph, theme, "order")
  select u.id, 'life', 'waves-02', 'paper', 0
  from public.users u
  where not exists (
    select 1 from public.ponds p where p.user_id = u.id and p."order" = 0
  )
  returning id, user_id
)
insert into pond_map (user_id, workspace, pond_id)
select user_id, 'main', id from ins;

-- 3b. `sandbox`, ONLY for users who actually have sandbox rows (#315 as ruled).
with sb as (
  select distinct user_id from public.pages         where workspace = 'sandbox'
  union
  select distinct user_id from public.conversations where workspace = 'sandbox'
  union
  select distinct user_id from public.change_log    where workspace = 'sandbox'
  union
  select distinct user_id from public.templates     where workspace = 'sandbox'
),
ins as (
  insert into public.ponds (user_id, name, glyph, theme, "order")
  select sb.user_id, 'sandbox', 'waves-02', 'paper', 1
  from sb
  where not exists (
    select 1 from public.ponds p where p.user_id = sb.user_id and p."order" = 1
  )
  returning id, user_id
)
insert into pond_map (user_id, workspace, pond_id)
select user_id, 'sandbox', id from ins;

-- 3c. A replay, or a pond created between runs, still needs its map rows.
insert into pond_map (user_id, workspace, pond_id)
select p.user_id, case p."order" when 1 then 'sandbox' else 'main' end, p.id
from public.ponds p
where not exists (select 1 from pond_map m where m.pond_id = p.id);

-- 3d. Stamp every row. `change_log` passes its append-only trigger because
-- `pond_id` is not in the frozen identity list (0011:173-181).
update public.pages p
   set pond_id = m.pond_id
  from pond_map m
 where m.user_id = p.user_id and m.workspace = p.workspace and p.pond_id is null;

update public.conversations c
   set pond_id = m.pond_id
  from pond_map m
 where m.user_id = c.user_id and m.workspace = c.workspace and c.pond_id is null;

update public.change_log l
   set pond_id = m.pond_id
  from pond_map m
 where m.user_id = l.user_id and m.workspace = l.workspace and l.pond_id is null;

-- `templates.user_id` references auth.users where the other three reference
-- public.users (an 0016 inconsistency). The ids are the same value, so the join
-- holds; the FK is left alone here rather than widening this migration.
update public.templates t
   set pond_id = m.pond_id
  from pond_map m
 where m.user_id = t.user_id and m.workspace = t.workspace and t.pond_id is null;

-- 3e. Assert the backfill left nothing behind, so a partial stamp fails loudly
-- here instead of surfacing as a missing page later.
do $$
declare n bigint;
begin
  select (select count(*) from public.pages         where pond_id is null)
       + (select count(*) from public.conversations where pond_id is null)
       + (select count(*) from public.change_log    where pond_id is null)
       + (select count(*) from public.templates     where pond_id is null)
    into n;
  if n > 0 then
    raise exception 'backfill incomplete: % rows still have a null pond_id', n;
  end if;
end $$;

-- ─── 4. Add pond-keyed uniqueness ALONGSIDE the old indexes ─────────────────
-- Both existing unique indexes are keyed on `user_id`, so they constrain a
-- PERSON where multi-pond must constrain a POND. The obvious move is to re-key
-- them. That is WRONG while `pond_id` is nullable, and the pglite suite proved
-- it: NULLs are distinct in a unique index, every app insert omits `pond_id`
-- today, so an index keyed on `pond_id` alone constrains NOTHING for new rows.
-- Dropping the old index would silently disable sibling-title uniqueness for the
-- whole transition.
--
-- So both live together. The old indexes keep holding on `(user_id, workspace,…)`
-- for rows that have no pond yet; the new ones hold on `pond_id` for rows that
-- do. The migration that sets `pond_id not null` drops the old pair.

-- One root per pond, beside 0006's one-home-per-user. Both are satisfiable
-- today: every user has one pond and at most one home row. The old index is what
-- blocks a SECOND root, so the slice that creates per-pond roots (with `?pond=`,
-- #313) is the one that drops it — see this migration's header for why no
-- sandbox root is created here.
create unique index if not exists pages_one_root_per_pond
  on public.pages (pond_id)
  where type = 'home';

-- Sibling-title uniqueness per pond, beside 0009's per-user-and-workspace
-- version. Without the pond-keyed one, two ponds would collide on any shared
-- top-level page name once rows carry a pond, because every pond created after
-- this migration inherits `workspace = 'main'` from 0005's default.
create unique index if not exists pages_sibling_title_pond_uniq
  on public.pages (
    pond_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(title))
  )
  where btrim(title) <> '';

-- ─── 5. A new account gets a pond ────────────────────────────────────────────
-- Without this a new sign-up has no pond at all. Replaces 0001's body, which
-- inserted only the `public.users` mirror row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);

  -- The person's own pond. `#320`: its root page is created on first open by
  -- `getOrCreateHomePage`, exactly as 0006 already arranged, so a brand-new pond
  -- holds no `pages` rows until it is visited.
  insert into public.ponds (user_id, name, glyph, theme, "order")
  values (new.id, 'life', 'waves-02', 'paper', 0);

  return new;
end;
$$;

commit;
