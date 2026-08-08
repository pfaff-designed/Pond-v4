-- ─── Drop legacy node tables ─────────────────────────────────────────────────
-- Final step of the unified page-tree migration. Everything in areas / routines
-- / projects / actions / documents was copied into public.pages (id-preserving)
-- by 0003_unified_pages.sql, and all application code now reads/writes `pages`
-- only. This removes the now-unused tables and their helpers.
--
-- IRREVERSIBLE. Apply only after the app has been verified end-to-end on `pages`.
-- (The data already lives in `pages`; these drops remove the stale duplicates.)

drop function if exists public.match_documents(vector, uuid, int);
drop function if exists public.seed_default_areas(uuid);

-- Child tables reference areas/projects via FK; drop in dependency order.
-- CASCADE also removes any dependent policies/constraints.
drop table if exists public.actions cascade;
drop table if exists public.routines cascade;
drop table if exists public.projects cascade;
drop table if exists public.documents cascade;
drop table if exists public.areas cascade;
