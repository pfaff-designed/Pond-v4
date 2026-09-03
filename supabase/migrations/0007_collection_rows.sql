-- ─── Collection rows (#18) ──────────────────────────────────────────────────
-- A collection is a page carrying a `_schema` (props._schema); its schema-bound
-- children are pages of the new `row` type. A row is a REAL, openable page (its
-- own blocks + props) but is filtered out of the ['pages'] tree the rail and
-- overview read (see lib/pages/tree.ts fetchPages) and is surfaced only through
-- a collection's views (#19). Ordinary sub-pages keep their existing types.
--
-- Additive + reversible: this only widens the `type` CHECK to admit `row`. No
-- data is moved; existing rows are untouched. Rows are created by the client
-- (add_row → createPage with type='row'), so this migration seeds nothing — it
-- just makes the `row` type legal.
--
-- Down (manual, if ever needed):
--   delete from public.pages where type = 'row';
--   alter table public.pages drop constraint pages_type_check,
--     add constraint pages_type_check
--       check (type in ('area','project','routine','action','page','home'));

-- Widen the tag CHECK to admit the collection row type.
alter table public.pages drop constraint if exists pages_type_check;
alter table public.pages
  add constraint pages_type_check
  check (type in ('area', 'project', 'routine', 'action', 'page', 'home', 'row'));
