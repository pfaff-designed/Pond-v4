-- ─── Colour belongs to areas; recent glyphs per pond ─────────────────────────
--
-- `Pond 06.24` (6y): "A page takes its area's colour, always. It has no colour
-- of its own." 0015 let any page carry an `area_role`; an area is a top-level
-- page (`parent_id is null`), and only an area may now hold one. A page's colour
-- is resolved from its area at render (`src/lib/pages/mark.ts`), so moving a
-- page to another area recolours it with no write.
--
-- 1. Clear the role on every page that is not an area. No board draws a page
--    colour, so there is nothing to preserve.
-- 2. An area moved inside another page becomes a page, so the move clears its
--    role in the same write. Moving it back out leaves it ink: "Pond never picks
--    one".
-- 3. `pages_area_role_area_only` refuses a role on a page that is not an area.
-- 4. `ponds.recent_glyphs`: "the 8 glyphs last picked in this pond", newest
--    first. The app keeps it distinct (`pushRecentGlyph`); the CHECK keeps it
--    short.
--
-- Down (manual):
--   begin;
--   drop trigger if exists pages_area_role_clear_on_nest on public.pages;
--   drop function if exists public.pages_area_role_clear_on_nest();
--   alter table public.pages drop constraint if exists pages_area_role_area_only;
--   alter table public.ponds drop column if exists recent_glyphs;
--   commit;
--   -- The cleared page roles are not restored.

begin;

-- ─── 1. Pages hold no colour ─────────────────────────────────────────────────
update public.pages
   set area_role = null
 where parent_id is not null
   and area_role is not null;

-- ─── 2. A nested area drops its role ─────────────────────────────────────────
-- Before the constraint, so the constraint never sees a move it would refuse.
create or replace function public.pages_area_role_clear_on_nest()
returns trigger
language plpgsql
as $$
begin
  if old.parent_id is null and new.parent_id is not null then
    new.area_role := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pages_area_role_clear_on_nest on public.pages;
create trigger pages_area_role_clear_on_nest
  before update of parent_id on public.pages
  for each row execute function public.pages_area_role_clear_on_nest();

-- ─── 3. Only an area takes a role ────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pages_area_role_area_only'
  ) then
    alter table public.pages
      add constraint pages_area_role_area_only
      check (area_role is null or parent_id is null);
  end if;
end $$;

comment on column public.pages.area_role is
  'Colour ROLE of an area — area-a | area-b | area-c — never a colour; areas only (parent_id is null). Every other page takes its area''s role at render. NULL = ink, no colour.';

comment on column public.pages.glyph is
  'Explicit Make Noise glyph (a public/icons/<name>.png silhouette). NULL = automatic: an area''s glyph derives from its title, a page shows its kind dot. An explicit glyph survives a rename.';

-- ─── 4. Recent glyphs on the pond ────────────────────────────────────────────
alter table public.ponds
  add column if not exists recent_glyphs text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ponds_recent_glyphs_max'
  ) then
    alter table public.ponds
      add constraint ponds_recent_glyphs_max
      check (cardinality(recent_glyphs) <= 8);
  end if;
end $$;

comment on column public.ponds.recent_glyphs is
  'The last 8 distinct glyphs picked in this pond, newest first. The glyph picker lists them after automatic.';

commit;
