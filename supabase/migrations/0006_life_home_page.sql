-- ─── Life home page (ticket-44) ─────────────────────────────────────────────
-- The Life root becomes a REAL home page that holds its own blocks, rendered
-- above the areas grid on the Life overview. It is a reserved, per-user row of
-- the new `home` type: top-level (parent_id = null), one per user, never shown
-- as a rail child and never counted in the areas overview (the app filters it by
-- type at the read boundary — see lib/pages/tree.ts and lib/pages/home.ts).
--
-- Additive + reversible: this only widens the `type` CHECK and adds a partial
-- unique index. No data is moved; existing rows are untouched. The home row is
-- created lazily by the client on first access (getOrCreateHomePage), so this
-- migration seeds nothing — it just makes the `home` type legal and singular.
--
-- Down (manual, if ever needed):
--   drop index if exists public.pages_one_home_per_user;
--   delete from public.pages where type = 'home';
--   alter table public.pages drop constraint pages_type_check,
--     add constraint pages_type_check
--       check (type in ('area','project','routine','action','page'));

-- Widen the tag CHECK to admit the reserved home type.
alter table public.pages drop constraint if exists pages_type_check;
alter table public.pages
  add constraint pages_type_check
  check (type in ('area', 'project', 'routine', 'action', 'page', 'home'));

-- At most one home row per user. Partial unique index over the home rows only,
-- so a race that tries to insert a second home row fails cleanly (the client's
-- get-or-create then re-reads the winner) rather than silently duplicating.
create unique index if not exists pages_one_home_per_user
  on public.pages (user_id)
  where type = 'home';
