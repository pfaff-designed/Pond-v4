-- ─── Narrow the `users` mirror-row policy to SELECT (issue #145) ─────────────
--
-- `0001_initial_schema.sql:13-14` shipped:
--
--   create policy "users: own row" on public.users
--     for all using (auth.uid() = id);
--
-- `for all` includes DELETE. `public.pages` cascades off `public.users`
-- (`0003_unified_pages.sql:16`), as do six more tables in 0001, and the app
-- ships an anon browser client (`src/lib/supabase/client.ts:5`) — so
--
--   supabase.from('users').delete().eq('id', myId)
--
-- deleted the entire page tree, today, with no migration applied.
--
-- This is NOT a breach: Pond is single-user and the only actor who satisfies
-- `auth.uid() = id` is the owner. It is a DURABILITY / BLAST-RADIUS problem —
-- nothing in the schema stood between one stray statement and everything. That
-- is precisely the guarantee the change log (#102) exists to provide, and it
-- could not provide it while 0011's account-deletion exemption keyed off this
-- same deletable mirror row. Both halves land together: 0011 now reads
-- `auth.users`, and the client loses the verb it never used.
--
-- SELECT is the whole surface the app needs. No application code touches
-- public.users at all — grep for `from('users')` returns nothing. The mirror row
-- is written by 0001's `on_auth_user_created` trigger, which is SECURITY DEFINER
-- and so bypasses RLS entirely. Account deletion still works: it goes through
-- `auth.users` and cascades down as before.
--
-- Down (manual, if ever needed):
--   drop policy if exists "users: read own row" on public.users;
--   create policy "users: own row" on public.users for all using (auth.uid() = id);

begin;

-- Re-runnable: drop-if-exists on both the old name and the new one, so applying
-- this twice is a no-op rather than a duplicate-object abort.
drop policy if exists "users: own row" on public.users;
drop policy if exists "users: read own row" on public.users;

create policy "users: read own row" on public.users
  for select using (auth.uid() = id);

commit;
