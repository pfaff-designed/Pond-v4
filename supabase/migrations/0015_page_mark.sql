-- ─── A page's own mark: glyph + area role (issue #134) ──────────────────────
--
-- #91 shipped the glyph system with a DERIVED mapping: an area's silhouette
-- comes from its title (`src/lib/rail/area-glyph.ts`) and its colour from a hash
-- of its id (`pageAccent`). Neither is choosable, and renaming a page silently
-- changes its mark — the complaint this issue opens with.
--
-- Two nullable columns. NULL means "derive", so this is additive with no
-- backfill and an untouched pond looks exactly as it did.
--
-- WHY COLUMNS AND NOT `props`. `props` is the user-facing property bag:
-- `setProperty` writes arbitrary user-named keys into it, so a person who defines
-- a field called "glyph" on a collection would collide with their own mark. A
-- mark is a first-class page attribute rendered in the rail, the breadcrumb and
-- the overview kicker; it belongs beside `status` and `order`.
--
-- WHY A ROLE AND NOT A COLOUR. `area_role` stores 'area-a' — never 'sage', and
-- never '#648F7B'. The design law is that "raw palette values never move — only
-- roles reassign (8 themes, 1g)" (AGENTS.md §Design language). A stored hex would
-- pin every mark to one theme and need a migration per theme; a stored role
-- follows whatever the active theme assigns, resolved at render. It is the same
-- reason the Life root already passes `var(--mn-area-a)` rather than a hex.
--
-- The CHECK lists the roles that EXIST today. A theme introducing a fourth is a
-- deliberate migration, exactly as a ninth change-log status would be.
--
-- Down (manual):
--   alter table public.pages drop column if exists glyph, drop column if exists area_role;

begin;

alter table public.pages
  add column if not exists glyph text,
  add column if not exists area_role text;

-- Separate from the ADD so a replay against a table that already has the column
-- still installs the constraint (ADD COLUMN IF NOT EXISTS skips its inline CHECK).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pages_area_role_check'
  ) then
    alter table public.pages
      add constraint pages_area_role_check
      check (area_role is null or area_role in ('area-a', 'area-b', 'area-c'));
  end if;
end $$;

comment on column public.pages.glyph is
  'Explicit Make Noise glyph name (a public/icons/<name>.png silhouette). NULL = derive from the title via area-glyph.ts. An explicit glyph survives a rename; a derived one does not.';

comment on column public.pages.area_role is
  'Explicit area colour ROLE — area-a | area-b | area-c — never a colour. Resolved to var(--mn-area-*) at render, so a theme reassigning the role moves the mark with it. NULL = inherit from the nearest ancestor that has one, else derive from the id.';

commit;
