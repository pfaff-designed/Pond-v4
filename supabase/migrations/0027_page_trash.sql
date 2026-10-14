-- ─── Pages move to trash on delete, restorable with a logged record (KAN-97) ─
--
-- Replaces the hard delete with a soft one, across five parts: the column
-- and the sibling-title index (1), the split RLS policies that hide a
-- trashed row from every ordinary read (2), `trash_page` (3), `restore_page`
-- (4), and `pages_existing` (5) — plus hardening added under each part once
-- a gap was found by review.
--
-- Part 1: `deleted_at`, and `pages_sibling_title_pond_uniq` (0018) goes
-- partial on it. Without the partial clause, a trashed "Untitled" would keep
-- blocking a new sibling "Untitled" forever — the exact regression KAN-273
-- just fixed for the live case. The index's existing `btrim(title) <> ''`
-- clause stays; `deleted_at is null` is ANDed alongside it, so a live
-- duplicate is still refused and only a trashed row stops counting.

begin;

alter table public.pages
  add column if not exists deleted_at timestamptz null;

drop index if exists public.pages_sibling_title_pond_uniq;

create unique index if not exists pages_sibling_title_pond_uniq
  on public.pages (
    pond_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(title))
  )
  where deleted_at is null and btrim(title) <> '';

-- Part 2: the one choke point acceptance needs ("trashed pages never appear
-- in search, ⌘K, relations or rollups"). `"pages: own rows"` gated every verb
-- on ownership alone; splitting it into one policy per verb lets SELECT and
-- UPDATE add `deleted_at is null` so a trashed row is invisible to every
-- ordinary PostgREST read and un-targetable by a direct UPDATE. INSERT's and
-- UPDATE's `with check` also require `deleted_at is null`, so an ordinary
-- client can neither insert a pre-trashed row nor set `deleted_at` itself on
-- an update — only `trash_page`/`restore_page` below, SECURITY DEFINER and so
-- running as the table owner, bypass RLS to stamp or clear it. DELETE keeps
-- exactly the ownership check it had before, but that policy alone does not
-- govern its reach: Postgres requires a row to pass the table's SELECT policy
-- (to read its columns for the WHERE clause) before DELETE's own USING clause
-- is even consulted. So an owner's direct DELETE against an already-trashed
-- row — e.g. a compensating rollback — now affects 0 rows, same as the direct
-- UPDATE above; a purge of trashed rows must run SECURITY DEFINER (or as the
-- service role), bypassing RLS the way `trash_page`/`restore_page` do.
drop policy "pages: own rows" on public.pages;

create policy "pages: select own live rows" on public.pages
  for select using (auth.uid() = user_id and deleted_at is null);

create policy "pages: update own live rows" on public.pages
  for update
  using (auth.uid() = user_id and deleted_at is null)
  with check (auth.uid() = user_id and deleted_at is null);

create policy "pages: insert own rows" on public.pages
  for insert with check (auth.uid() = user_id and deleted_at is null);

create policy "pages: delete own rows" on public.pages
  for delete using (auth.uid() = user_id);

-- Part 3: `trash_page`, the RPC the rail's delete calls. SECURITY DEFINER so it
-- can read and stamp a page's whole subtree in one statement regardless of the
-- part-2 SELECT policy that now hides a trashed row even from its own owner —
-- an ordinary client call would see nothing to stamp a second time onward.
--
-- Ownership is checked the same way `accept_revert_record` checks it: the
-- lookup itself is scoped to `user_id = auth.uid()`, so another person's page
-- and a page that does not exist raise the identical "not found" — nothing here
-- lets a non-owner learn which is true. Trashing twice is refused the same way:
-- a page already in trash is already "not found" to a lookup that bypasses the
-- SELECT policy only on purpose, so it is checked explicitly instead.
--
-- `before` carries the TrashSnapshot (src/lib/change-log/types.ts) the deleted
-- view and `restore_page` both read: title/parent/order to put it back, the
-- subtree's ids so restore knows what to un-stamp, and two counts for the s6o6
-- card. Not specified by the ticket: `blockCount` is summed across the WHOLE
-- subtree (root + every descendant's own `blocks`), not the root page alone —
-- "held 4 blocks, 1 nested page" reads as everything the trashed node carried
-- away, and `nestedPageCount` already states separately how many pages that was.

create or replace function public.trash_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page public.pages;
  v_now timestamptz := now();
  v_ids uuid[];
  v_block_count integer;
  v_nested_count integer;
  v_parent_path text[];
begin
  select * into v_page from public.pages
    where id = p_page_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'page % not found', p_page_id
      using errcode = 'no_data_found', detail = 'not-found';
  end if;
  if v_page.deleted_at is not null then
    raise exception 'page % not found', p_page_id
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  -- The pond root (`type = 'home'`) and the databases root (a top-level page
  -- titled "databases" — `isDatabasesRoot` in src/lib/pages/databases-root.ts,
  -- no stored type of its own) are each a pond's one-per-kind root.
  -- `pages_one_root_per_pond` (0018) is NOT partial on `deleted_at`, so a
  -- trashed home row would still count against it and permanently block the
  -- pond from ever getting a new one — these two pages must never be
  -- trashable at all.
  if v_page.type = 'home'
     or (v_page.parent_id is null and lower(btrim(v_page.title)) = 'databases')
  then
    raise exception 'page % cannot be trashed', p_page_id
      using errcode = 'invalid_parameter_value', detail = 'not-trashable';
  end if;

  -- `and p.deleted_at is null` keeps an already-trashed descendant OUT of this
  -- walk: without it, trashing P after C (a child of P) was independently
  -- trashed on its own would re-stamp C with P's timestamp and fold it into
  -- P's snapshot, and restoring P would then bring C back too.
  with recursive subtree as (
    select id from public.pages where id = p_page_id
    union all
    select p.id
      from public.pages p
      join subtree s on p.parent_id = s.id
     where p.user_id = v_page.user_id
       and p.deleted_at is null
  )
  select array_agg(id) into v_ids from subtree;

  select coalesce(sum(jsonb_array_length(blocks)), 0)::integer, count(*) - 1
    into v_block_count, v_nested_count
    from public.pages
   where id = any(v_ids);

  with recursive chain as (
    select id, parent_id, title, 0 as depth from public.pages where id = v_page.parent_id
    union all
    select p.id, p.parent_id, p.title, c.depth + 1
      from public.pages p
      join chain c on p.id = c.parent_id
  )
  select array_agg(title order by depth desc) into v_parent_path from chain;

  -- `and deleted_at is null` guards against a concurrent trash of one of these
  -- same ids between the subtree walk above and this statement (e.g. another
  -- session trashing a child independently in the gap) re-stamping it with
  -- THIS call's timestamp instead of its own.
  update public.pages set deleted_at = v_now where id = any(v_ids) and deleted_at is null;

  insert into public.change_log
    (user_id, pond_id, status, action, actor, target_page_id,
     "before", transitions, created_at, status_at)
  values (
    v_page.user_id, v_page.pond_id, 'accepted', 'delete', 'you', p_page_id,
    jsonb_build_object(
      'title', v_page.title,
      'parentId', v_page.parent_id,
      'order', v_page."order",
      'pageIds', to_jsonb(v_ids),
      'blockCount', v_block_count,
      'nestedPageCount', v_nested_count,
      'parentPath', to_jsonb(coalesce(v_parent_path, '{}'::text[])),
      'deletedAt', v_now
    ),
    jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', 'you')),
    v_now, v_now
  );
end;
$$;

revoke all on function public.trash_page(uuid) from public;
grant execute on function public.trash_page(uuid) to authenticated;

-- Part 4: `restore_page`, the answer to a `delete` record. Takes the
-- CHANGE-LOG RECORD id, not the page id — the record is what carries the
-- `TrashSnapshot` to put the subtree back by, and is also how the caller
-- names which trashing it is undoing.
--
-- SECURITY DEFINER for the same reason as `trash_page`: part 2's SELECT
-- policy hides the trashed root from its own owner, so an ordinary client
-- call could not even look the page up to restore it.
--
-- "Restoring a record twice" is refused, not a no-op: a second restore on a
-- record whose page is already live has no old state left to distinguish it
-- from "restore some other unrelated already-live page", so a clear refusal
-- (AGENTS.md style: `accept_revert_record`'s `already-undone`) beats a silent
-- no-op that could mask the caller asking for the wrong thing.
--
-- A collision with a LIVE sibling's title is suffixed, never refused
-- (convivial — "nothing is locked in", restore should not dead-end); the
-- suffix loops ("(restored)", "(restored 2)", …) until it finds a name that is
-- itself free, rather than applying it once and letting a second collision
-- raise 23505 raw. An empty title never collides (the partial unique index
-- already ignores it, via `btrim(title) <> ''`). A gone or trashed original
-- parent falls back to the pond root (`parent_id = null`) and the fallback is
-- stamped onto the `restore` record's `after` snapshot as `parentFallback` so
-- the deleted view can say so, without the UI having to re-derive it by
-- diffing against the `delete` record it answers. Every sibling check below
-- is scoped to `v_root.pond_id` as well as the owner: a page's siblings are
-- the rest of ITS pond, not every page the user owns across every pond.
create or replace function public.restore_page(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.change_log;
  v_before jsonb;
  v_root_id uuid;
  v_root public.pages;
  v_title text;
  v_target_parent uuid;
  v_target_order integer;
  v_fell_back boolean := false;
  v_ids uuid[];
  v_now timestamptz := now();
  v_parent_path text[];
  v_stamp timestamptz;
  v_candidate text;
  v_suffix integer;
begin
  select * into v_record from public.change_log
    where id = p_record_id and user_id = auth.uid() and action = 'delete'
    for update;
  if not found then
    raise exception 'record % not found', p_record_id
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  v_before := v_record.before;
  v_root_id := v_record.target_page_id;
  v_stamp := (v_before->>'deletedAt')::timestamptz;

  select * into v_root from public.pages
    where id = v_root_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'page % no longer exists', v_root_id
      using errcode = 'no_data_found', detail = 'page-gone';
  end if;
  -- Matching the exact stamp `trash_page` wrote (not just "is trashed") keeps
  -- this record from un-trashing a page that was restored and re-trashed
  -- since, under a stamp this record never named. `is distinct from` (rather
  -- than `<>`) also refuses a null `v_stamp` outright: `<>` against null is
  -- null, not true, so a record with no recorded stamp would otherwise pass
  -- this check and the final UPDATE's `deleted_at = v_stamp` would then match
  -- no row, restoring nothing while still writing a `restore` record.
  if v_stamp is null or v_root.deleted_at is distinct from v_stamp then
    raise exception 'page % is not in trash', v_root_id
      using errcode = 'invalid_parameter_value', detail = 'already-restored';
  end if;

  v_title := v_before->>'title';
  v_target_parent := case when v_before->>'parentId' is null then null
    else (v_before->>'parentId')::uuid end;
  v_target_order := (v_before->>'order')::integer;
  select array(select jsonb_array_elements_text(v_before->'pageIds'))::uuid[] into v_ids;

  -- The recorded parent only needs checking when it was non-root — null
  -- already names the pond root, which always exists.
  if v_target_parent is not null and not exists (
    select 1 from public.pages
     where id = v_target_parent and user_id = auth.uid() and deleted_at is null
  ) then
    v_target_parent := null;
    v_fell_back := true;
  end if;

  if btrim(v_title) <> '' then
    v_candidate := v_title;
    v_suffix := 0;
    while exists (
      select 1 from public.pages
       where user_id = auth.uid()
         and pond_id = v_root.pond_id
         and deleted_at is null
         and id <> v_root_id
         and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(v_target_parent, '00000000-0000-0000-0000-000000000000'::uuid)
         and lower(btrim(title)) = lower(btrim(v_candidate))
    ) loop
      v_suffix := v_suffix + 1;
      v_candidate := v_title || ' (restored' ||
        case when v_suffix = 1 then '' else ' ' || v_suffix end || ')';
    end loop;
    v_title := v_candidate;
  end if;

  if v_fell_back then
    select coalesce(max("order"), -1) + 1 into v_target_order
      from public.pages
     where user_id = auth.uid()
       and pond_id = v_root.pond_id
       and parent_id is null
       and deleted_at is null;
  else
    -- Make room at the recorded slot: trashing never renumbered the siblings
    -- left behind, so the slot is still open, but anything that was already
    -- at or past it shifts up by one to keep the restored page at its old
    -- position rather than after everything that has since taken that order.
    update public.pages
       set "order" = "order" + 1
     where user_id = auth.uid()
       and pond_id = v_root.pond_id
       and deleted_at is null
       and id <> v_root_id
       and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_target_parent, '00000000-0000-0000-0000-000000000000'::uuid)
       and "order" >= v_target_order;
  end if;

  with recursive chain as (
    select id, parent_id, title, 0 as depth from public.pages where id = v_target_parent
    union all
    select p.id, p.parent_id, p.title, c.depth + 1
      from public.pages p
      join chain c on p.id = c.parent_id
  )
  select array_agg(title order by depth desc) into v_parent_path from chain;

  update public.pages set
    deleted_at = null,
    parent_id = case when id = v_root_id then v_target_parent else parent_id end,
    "order" = case when id = v_root_id then v_target_order else "order" end,
    title = case when id = v_root_id then v_title else title end
   where id = any(v_ids) and deleted_at = v_stamp;

  insert into public.change_log
    (user_id, pond_id, status, action, actor, target_page_id,
     "after", transitions, created_at, status_at)
  values (
    v_root.user_id, v_root.pond_id, 'accepted', 'restore', 'you', v_root_id,
    jsonb_build_object(
      'title', v_title,
      'parentId', v_target_parent,
      'order', v_target_order,
      'pageIds', v_before->'pageIds',
      'blockCount', (v_before->>'blockCount')::integer,
      'nestedPageCount', (v_before->>'nestedPageCount')::integer,
      'parentPath', to_jsonb(coalesce(v_parent_path, '{}'::text[])),
      'parentFallback', v_fell_back
    ),
    jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', 'you')),
    v_now, v_now
  );
end;
$$;

revoke all on function public.restore_page(uuid) from public;
grant execute on function public.restore_page(uuid) to authenticated;

-- Part 5: `pages_existing`, the deleted view's only way to tell "still in
-- trash" from "emptied" now that part 2's SELECT policy hides a trashed row
-- even from its own owner — an ordinary client select can no longer
-- distinguish the two itself. SECURITY DEFINER so it can see trashed rows at
-- all; owner-scoped by filtering on `auth.uid()` rather than trusting the
-- caller. Returns which of the given ids still EXIST as ROWS at all — trashed
-- or live, not "still trashed" alone — which is the full standing-in for the
-- out-of-scope 30-day purge job: once that job hard-deletes a trashed row, its
-- id drops out of this result and the deleted view reads that as "emptied".

create or replace function public.pages_existing(p_page_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(id), '{}'::uuid[])
    from public.pages
   where id = any(p_page_ids) and user_id = auth.uid();
$$;

revoke all on function public.pages_existing(uuid[]) from public;
grant execute on function public.pages_existing(uuid[]) to authenticated;

commit;
