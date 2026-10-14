-- ─── restore_page puts a page back at its own recorded order, shifting
--     nothing else (KAN-97 production fix) ─────────────────────────────────
--
-- Why: 0027's restore_page re-indexed every live sibling with "order" >=
-- the recorded target by +1, on the theory that the restored page's old
-- slot needed reopening. But new pages are created with order 0
-- (src/lib/pages/client.ts), siblings commonly tie at 0, and the rail
-- breaks ties by (order, lower(title)) (src/lib/rail/tree.ts) — so for a
-- tied group the "shift" put the restored page at order 1 while every
-- real sibling that had been sitting at 0 got bumped to 1 too, which
-- sorted the restored page FIRST and renumbered pages nobody touched.
-- The live check (KAN-97 comment 10129) caught this: a page restored from
-- index 2 came back at index 0.
--
-- What changed: restore_page is re-created from 0027's body verbatim,
-- with ONLY the non-fallback branch's reindexing UPDATE removed. The
-- page's own "order" still goes back to its recorded value (the final
-- UPDATE already does that); no other row's "order" is touched. For a
-- tied group (all 0) this reopens no slot because there was never a gap
-- to reopen — the restored page simply retakes order 0 alongside its
-- ties, and (order, lower(title)) sorts it exactly where it was. For a
-- dense group (0,1,2,…) the slot the page vacated on trash was never
-- closed either (trashing never renumbers the siblings it leaves behind,
-- per 0027's own part-4 comment), so putting the page back at its old
-- order reopens that exact slot without displacing anything else. The
-- pond-root fallback branch (max("order") + 1) is unchanged — there is
-- no recorded slot to return to when the original parent is gone, so it
-- still lands after everything else at the root.
--
-- Down (manual): re-run 0027's `create or replace function
--   public.restore_page`.

begin;

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
  end if;
  -- Non-fallback branch: shift nothing. The page's own "order" goes back to
  -- v_target_order (its recorded value) via the final UPDATE below; no other
  -- row is touched. See the migration header for why 0027's reindex here was
  -- wrong under tied orders.

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

commit;
