-- ─── Drop the `area` type (issue #108) ──────────────────────────────────────
-- Design law (`wayfinder/design_handoff_pond/Pond 03 Concepts.dc.html`, data
-- model draft 3): "area — a page with pages inside it. It has NO TECHNICAL
-- MEANING; it is how a person thinks about their pond." Pages all the way down.
--
-- The code contradicted that: `type = 'area'` was a hard structural marker that
-- drove rail folder rendering, content counting, and which surface rendered. It
-- conflated the human, editable KIND label (page · project · recipe · collection
-- …) with a structural flag. After this migration area-ness is COMPUTED — a page
-- is an area iff it has children — and `type` is only the kind tag (plus the two
-- reserved technical values `home` and `row`, which the UI never offers).
--
-- What this does to existing rows:
--   1) Every `type = 'area'` row becomes `type = 'page'`. No rows are added,
--      deleted, reparented or reordered — only the tag changes, so each former
--      area keeps its children and therefore still renders as a rail folder and
--      still gets the child-grid overview surface. Zero row loss.
--   2) The tag CHECK stops admitting 'area'.
--   3) `seed_default_pages` / `seed_sandbox_pages` seed `type = 'page'` instead
--      (they would otherwise violate the narrowed CHECK on the next new user /
--      sandbox reset).
--
-- Down (manual, if ever needed) — note the app renders correctly either way,
-- because area-ness is emergent from having children:
--   alter table public.pages drop constraint pages_type_check,
--     add constraint pages_type_check
--       check (type in ('area','project','routine','action','page','home','row'));
--   -- optionally re-tag the containers:
--   -- update public.pages p set type = 'area'
--   --   where p.type = 'page'
--   --     and exists (select 1 from public.pages c where c.parent_id = p.id);

begin;

-- 1) Convert the data BEFORE narrowing the CHECK, or the constraint would be
--    added against violating rows and fail.
update public.pages
set type = 'page'
where type = 'area';

-- 2) Narrow the tag CHECK. 'home' (the Life home singleton) and 'row' (a
--    collection's schema-bound child) stay: they are genuinely technical and
--    filtered out of the ['pages'] tree at the read boundary.
alter table public.pages drop constraint if exists pages_type_check;
alter table public.pages
  add constraint pages_type_check
  check (type in ('project', 'routine', 'action', 'page', 'home', 'row'));

-- 3) Reseed functions. The five top-level pages are still seeded (they are the
--    starting shape of a pond) — they are just pages now, and the rail renders
--    every top-level page as a folder, so they look identical at first run.
--    'Financial' → 'Finances' matches the display name settled in #107 (the
--    glyph map already resolved both).
create or replace function public.seed_default_pages(p_user_id uuid)
returns void language plpgsql as $$
begin
  insert into public.pages (user_id, parent_id, type, title, "order") values
    (p_user_id, null, 'page', 'Personal',     0),
    (p_user_id, null, 'page', 'Professional', 1),
    (p_user_id, null, 'page', 'Health',       2),
    (p_user_id, null, 'page', 'Finances',     3),
    (p_user_id, null, 'page', 'Creativity',   4);
end;
$$;

create or replace function public.seed_sandbox_pages(p_user_id uuid)
returns void language plpgsql as $$
declare
  v_area1_id uuid;
begin
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, null, 'page', 'Sandbox Area A', 0, 'sandbox')
  returning id into v_area1_id;

  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, null, 'page', 'Sandbox Area B', 1, 'sandbox');

  -- Demo page inside Sandbox Area A — the child that makes A a container.
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, v_area1_id, 'page', 'Demo Page', 0, 'sandbox');
end;
$$;

commit;
