-- ─── Seeded page titles are lowercase (#101 review) ─────────────────────────
--
-- The rail renders a page's title RAW. `Pond 05 Shell`'s source copy for the rail
-- is lowercase throughout (life, personal, journal, notes) and so is the
-- breadcrumb pill ("life › creativity › recipes › sourdough, 78%"); the capitals
-- in the boards come from `text-transform: uppercase` on the eyebrow and on page
-- titles, which the app's own CSS already carries. The data is lowercase; the
-- transforms are presentational. So the seeds write lowercase.
--
-- Functions only — this migration touches NO existing row. A pond seeded before
-- it keeps its title-cased areas (Personal, Health, …) until someone decides to
-- correct them; that correction is a separate, gated one-off and is deliberately
-- NOT written here.
--
-- Nothing reads these strings as a key: `areaGlyph` (src/lib/rail/area-glyph.ts)
-- resolves title→glyph case- and whitespace-insensitively, and `isDatabasesRoot`
-- matches its reserved title the same way. The sibling-title unique index (0009)
-- is unaffected: these are the only top-level rows a fresh pond has.
--
-- Down (manual, if ever needed): re-run 0010's bodies, which carry the
-- title-cased strings verbatim.

begin;

create or replace function public.seed_default_pages(p_user_id uuid)
returns void language plpgsql as $$
begin
  insert into public.pages (user_id, parent_id, type, title, "order") values
    (p_user_id, null, 'page', 'personal',     0),
    (p_user_id, null, 'page', 'professional', 1),
    (p_user_id, null, 'page', 'health',       2),
    (p_user_id, null, 'page', 'finances',     3),
    (p_user_id, null, 'page', 'creativity',   4);
end;
$$;

create or replace function public.seed_sandbox_pages(p_user_id uuid)
returns void language plpgsql as $$
declare
  v_area1_id uuid;
begin
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, null, 'page', 'sandbox area a', 0, 'sandbox')
  returning id into v_area1_id;

  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, null, 'page', 'sandbox area b', 1, 'sandbox');

  -- The demo page inside the first sandbox area — the child that makes it a container.
  insert into public.pages (user_id, parent_id, type, title, "order", workspace)
  values (p_user_id, v_area1_id, 'page', 'demo page', 0, 'sandbox');
end;
$$;

commit;
