-- ─── The template store (issue #154, epic #117 Phase 4) ─────────────────────
--
-- Design law: a template is a SHAPE YOU COPY, never a tie. Applying one copies
-- its blocks onto a new page and stamps one-way, advisory provenance into the
-- page's `props` (see src/lib/templates/provenance.ts). That is why there is NO
-- foreign key from `pages` to this table and nothing here cascades into pages:
-- editing or deleting a template must leave every page made from it
-- byte-identical.
--
-- Per-pond scope is (`user_id`, `workspace`), mirroring 0005 / 0011. The
-- `user_id` column is the hook for template sharing (M2 / Phase 7, #120); no
-- shared-visibility read path, share state or role check is built here.
--
-- `kind` is the fixed twelve-label vocabulary, stored and displayed EXPANDED
-- ('meeting notes', 'reading list' — the PondTemplate mockup's 'meeting' /
-- 'reading' are a prop artefact). A thirteenth kind is a migration, not a typo,
-- exactly as a ninth change-log status would be (0011).
--
-- `origin` tells the twelve premade shapes (code constants from #155, never
-- rows on a fresh pond) from the ones the person saved ('yours').
--
-- Down (manual, if ever needed):
--   drop table if exists public.templates cascade;

begin;

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  -- auth.users, not the public.users mirror row: account deletion is the one
  -- thing that takes templates with it (the lesson of #145 / 0012).
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Per-pond scope. Mirrors 0005's discriminator on pages/conversations.
  workspace text not null default 'main'
    check (workspace in ('main', 'sandbox')),

  name text not null,

  -- THE TWELVE, in spec order.
  kind text not null
    check (kind in (
      'page',
      'notes',
      'list',
      'project',
      'tracker',
      'journal',
      'collection',
      'database',
      'dashboard',
      'meeting notes',
      'reading list',
      'habit'
    )),

  -- The shape: the same 14-member content-block union a page's `blocks` holds
  -- (src/lib/modules/content.ts). Copied, never referenced.
  blocks jsonb not null default '[]'::jsonb,

  origin text not null
    check (origin in ('premade', 'yours')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One name per pond, compared case-insensitively and whitespace-trimmed —
-- the same lower(btrim(…)) key 0009's pages_sibling_title_uniq uses, so the
-- application helper (normalizeTitle) describes both. Unlike pages there is no
-- parent and no blank-title exemption: a template always has a name.
-- This index also serves listTemplates, which orders by name within a pond,
-- so no second index is needed.
create unique index if not exists templates_name_uniq
  on public.templates (user_id, workspace, lower(btrim(name)));

-- ── Row-level security ───────────────────────────────────────────────────────
--
-- FOUR separate per-verb policies, deliberately no `for all`. 0012 exists
-- because a `for all` policy on the users mirror row let one stray delete
-- cascade the pond away (#145); new tables grant verbs one at a time so each
-- is a visible, revocable decision.

alter table public.templates enable row level security;

-- `create policy` has no IF NOT EXISTS and these sit inside begin;…commit;, so
-- the drops keep a replay from aborting on a duplicate-object error.
drop policy if exists "templates: read own rows" on public.templates;
create policy "templates: read own rows" on public.templates
  for select using (auth.uid() = user_id);

drop policy if exists "templates: insert own rows" on public.templates;
create policy "templates: insert own rows" on public.templates
  for insert with check (auth.uid() = user_id);

drop policy if exists "templates: update own rows" on public.templates;
create policy "templates: update own rows" on public.templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "templates: delete own rows" on public.templates;
create policy "templates: delete own rows" on public.templates
  for delete using (auth.uid() = user_id);

comment on table public.templates is
  'Template store (#154). A template is a shape you copy, never a tie: no FK from pages, nothing cascades into pages. Scoped per pond (user_id, workspace).';

comment on column public.templates.kind is
  'One of the twelve fixed kinds, stored EXPANDED (meeting notes / reading list). Mirrors TEMPLATE_KINDS in src/lib/templates/types.ts.';

comment on column public.templates.origin is
  'premade = one of the twelve shipped shapes (code constants, #155); yours = saved by the person (#157).';

commit;
