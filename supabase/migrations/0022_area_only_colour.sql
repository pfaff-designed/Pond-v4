-- ─── Colour belongs to areas; recent glyphs per pond ─────────────────────────
--
-- An area is a top-level page that is neither the home row nor the databases
-- root (`public.page_is_area`, the same rule as `isArea` in
-- `src/lib/pages/mark.ts`). Only an area holds an `area_role`; every other page
-- takes its area's role at render, so moving a page to another area recolours it
-- with no write. A page that stops being an area — nested, renamed to
-- `databases`, retyped — loses its role in the same write, and stays ink if it
-- becomes an area again. `ponds.recent_glyphs` holds at most 8 glyphs, newest
-- first; the app keeps them distinct.
--
-- Down (manual):
--   begin;
--   drop trigger if exists pages_area_role_clear_when_not_area on public.pages;
--   drop function if exists public.pages_area_role_clear_when_not_area();
--   alter table public.pages drop constraint if exists pages_area_role_area_only;
--   drop function if exists public.page_is_area(uuid, text, text);
--   alter table public.ponds drop column if exists recent_glyphs;
--   commit;
--   -- The cleared roles are not restored.

begin;

-- ─── The area rule ───────────────────────────────────────────────────────────
create or replace function public.page_is_area(parent_id uuid, type text, title text)
returns boolean
language sql
immutable
as $$
  select parent_id is null
     and type is distinct from 'home'
     and lower(btrim(title)) is distinct from 'databases'
$$;

-- ─── Only areas hold a role ──────────────────────────────────────────────────
update public.pages
   set area_role = null
 where area_role is not null
   and not public.page_is_area(parent_id, type, title);

-- ─── A page that stops being an area drops its role ──────────────────────────
create or replace function public.pages_area_role_clear_when_not_area()
returns trigger
language plpgsql
as $$
begin
  if public.page_is_area(old.parent_id, old.type, old.title)
     and not public.page_is_area(new.parent_id, new.type, new.title) then
    new.area_role := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pages_area_role_clear_when_not_area on public.pages;
create trigger pages_area_role_clear_when_not_area
  before update of parent_id, type, title on public.pages
  for each row execute function public.pages_area_role_clear_when_not_area();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'pages_area_role_area_only'
       and conrelid = 'public.pages'::regclass
  ) then
    alter table public.pages
      add constraint pages_area_role_area_only
      check (area_role is null or public.page_is_area(parent_id, type, title));
  end if;
end $$;

comment on column public.pages.area_role is
  'Colour ROLE of an area — area-a | area-b | area-c — never a colour. Areas only (public.page_is_area); every other page takes its area''s role at render. NULL = ink, no colour.';

comment on column public.pages.glyph is
  'Explicit Make Noise glyph (a public/icons/<name>.png silhouette). NULL = automatic: an area''s glyph derives from its title, a page shows its kind dot. An explicit glyph survives a rename.';

-- ─── Recent glyphs on the pond ───────────────────────────────────────────────
alter table public.ponds
  add column if not exists recent_glyphs text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ponds_recent_glyphs_max'
       and conrelid = 'public.ponds'::regclass
  ) then
    alter table public.ponds
      add constraint ponds_recent_glyphs_max
      check (cardinality(recent_glyphs) <= 8);
  end if;
end $$;

comment on column public.ponds.recent_glyphs is
  'The last 8 distinct glyphs picked in this pond, newest first.';

commit;
