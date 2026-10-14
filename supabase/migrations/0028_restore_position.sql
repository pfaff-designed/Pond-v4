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

-- ─── part b: undoing an add_row sees every child, trashed included, before
--     it deletes the row (KAN-312) ─────────────────────────────────────────
--
-- Why: `change_log_set_back` (0024's body) runs as the CALLER, so its guard
-- against removing a row that "has had more written into it" —
-- `exists (select 1 from public.pages where parent_id = v_row_id)` — is
-- subject to 0027's SELECT policy, which hides a trashed row even from its
-- own owner. Trash a row's child, then undo the row's `add_row`: the exists()
-- check sees no children, the row is deleted, and `parent_id ... on delete
-- cascade` takes the trashed child with it — permanently, though its delete
-- card still said "restorable until …".
--
-- What changed: `private.page_has_any_child` is SECURITY DEFINER, so it sees
-- every child row regardless of trash state (owner-scoped by the ROW's own
-- user_id, not the caller's session, since a definer function must name whose
-- rows it reads rather than trust auth.uid() to already be scoped by RLS).
-- `change_log_set_back` is re-created from 0024's body verbatim, with ONLY
-- that one `exists(...)` replaced by a call to the helper — the errcode,
-- DETAIL ('record-changed') and every other branch are unchanged, so
-- `src/lib/change-log/undo.ts`'s classification of the refusal still applies.
--
-- No other undo path in src/ deletes a page directly: `undo_change_log_record`
-- (via `private.change_log_step` → `change_log_set_back`) is the only route
-- from an undo gesture to a page delete. `src/lib/pages/create-page.ts`'s
-- `create_page` records are never remembered by `sessionUndo` (grepped
-- `AITerminal.tsx`'s `acceptCreatePage` — no `sessionUndo.remember` call sits
-- near it, unlike `propose_changes`/`add_row`'s accept paths), so a created
-- page is never undone this way at all, trashed children or not. The other
-- `deletePage` call sites (`BlockCanvas.tsx`'s database-create rollback,
-- `create-database.ts`'s rollback, `use-collection-rows.ts`'s `removeRow`) are
-- a failed create's own cleanup or a person's direct row delete — neither is
-- an undo, so neither is in scope here.
--
-- Down (manual): drop function if exists private.page_has_any_child(uuid);
--   re-run 0024's `create or replace function private.change_log_set_back`.

begin;

create or replace function private.page_has_any_child(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.pages
     where parent_id = p_page_id
       and user_id = auth.uid()
  )
$$;

revoke all on function private.page_has_any_child(uuid) from public;
grant execute on function private.page_has_any_child(uuid) to authenticated;

create or replace function private.change_log_set_back(
  p_record public.change_log,
  p_kind text,
  p_from jsonb,
  p_to jsonb,
  p_position jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
  v_row public.pages;
  v_row_id uuid;
  v_glyph text;
  v_area_role text;
  v_parent_id uuid;
  v_type text;
  v_title text;
begin
  if p_kind = 'area_role' then
    -- `null` (ink) is a legitimate before/after, never `not-undoable`; only a
    -- shape neither a role nor ink refuses.
    if not (
      (p_from is null or jsonb_typeof(p_from) in ('string', 'null'))
      and (p_to is null or jsonb_typeof(p_to) in ('string', 'null'))
    ) then
      raise exception 'change_log record % carries no colour to set back', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;
    select area_role, parent_id, type, title into v_area_role, v_parent_id, v_type, v_title
      from public.pages
      where id = p_record.target_page_id
        and user_id = p_record.user_id
        and pond_id is not distinct from p_record.pond_id;
    if not found then
      raise exception 'change_log record %: the page it changed is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;
    if not public.page_is_area(v_parent_id, v_type, v_title) then
      raise exception 'page % is no longer an area; it cannot hold a colour', p_record.target_page_id
        using errcode = 'check_violation', detail = 'not-an-area';
    end if;
    if v_area_role is distinct from (p_from #>> '{}') then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;
    update public.pages set area_role = (p_to #>> '{}') where id = p_record.target_page_id;
    return null;
  end if;

  if p_kind = 'glyph' then
    -- `null` (automatic) is a legitimate before/after, never `not-undoable`;
    -- only a shape neither a glyph id nor automatic refuses.
    if not (
      (p_from is null or jsonb_typeof(p_from) in ('string', 'null'))
      and (p_to is null or jsonb_typeof(p_to) in ('string', 'null'))
    ) then
      raise exception 'change_log record % carries no glyph to set back', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;
    select glyph into v_glyph from public.pages
      where id = p_record.target_page_id
        and user_id = p_record.user_id
        and pond_id is not distinct from p_record.pond_id;
    if not found then
      raise exception 'change_log record %: the page it changed is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;
    if v_glyph is distinct from (p_from #>> '{}') then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;
    update public.pages set glyph = (p_to #>> '{}') where id = p_record.target_page_id;
    return null;
  end if;

  if p_kind = 'blocks' then
    if jsonb_typeof(p_from) is distinct from 'array' or jsonb_typeof(p_to) is distinct from 'array' then
      raise exception 'change_log record % carries no blocks to set back', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;
    select blocks into v_blocks from public.pages
      where id = p_record.target_page_id
        and user_id = p_record.user_id
        and pond_id is not distinct from p_record.pond_id;
    if not found then
      raise exception 'change_log record %: the page it changed is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;
    if v_blocks is distinct from p_from then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;
    update public.pages set blocks = p_to, updated_at = now()
      where id = p_record.target_page_id;
    return null;
  end if;

  if not (
    (p_from is null or private.change_log_is_row_snapshot(p_from))
    and (p_to is null or private.change_log_is_row_snapshot(p_to))
    and (p_from is not null or p_to is not null)
    and (p_from is null or p_to is null or p_from ->> 'id' = p_to ->> 'id')
  ) then
    raise exception 'change_log record % carries no record to set back', p_record.id
      using errcode = 'feature_not_supported', detail = 'not-undoable';
  end if;

  perform 1 from public.pages
    where id = p_record.target_page_id
      and user_id = p_record.user_id
      and pond_id is not distinct from p_record.pond_id;
  if not found then
    raise exception 'change_log record %: the database it changed is gone', p_record.id
      using errcode = 'no_data_found', detail = 'page-gone';
  end if;

  v_row_id := coalesce(p_from ->> 'id', p_to ->> 'id')::uuid;
  select * into v_row from public.pages where id = v_row_id;

  if p_from is null then
    if found then
      raise exception 'record % is already there', v_row_id
        using errcode = 'P0001', detail = 'record-changed';
    end if;
    begin
      insert into public.pages
        (id, user_id, pond_id, parent_id, type, title, props, "order", created_at)
      values (
        v_row_id, p_record.user_id, p_record.pond_id, p_record.target_page_id, 'row',
        p_to ->> 'title', (p_to -> 'values') - '_schema',
        coalesce((p_position ->> 'order')::integer, 0),
        coalesce((p_position ->> 'createdAt')::timestamptz, now())
      );
    exception when unique_violation then
      raise exception 'a sibling of record % has taken its name', v_row_id
        using errcode = 'unique_violation', detail = 'name-taken';
    end;
    return null;
  end if;

  if not found
     or v_row.parent_id is distinct from p_record.target_page_id
     or v_row.user_id is distinct from p_record.user_id
     or v_row.pond_id is distinct from p_record.pond_id
     or v_row.title is distinct from p_from ->> 'title'
     or (v_row.props - '_schema') is distinct from (p_from -> 'values')
  then
    raise exception 'record % changed since change_log record %', v_row_id, p_record.id
      using errcode = 'P0001', detail = 'record-changed';
  end if;

  if p_to is null then
    if v_row.blocks is distinct from '[]'::jsonb
       or private.page_has_any_child(v_row_id)
    then
      raise exception 'record % has had more written into it since change_log record %',
        v_row_id, p_record.id
        using errcode = 'P0001', detail = 'record-changed';
    end if;
    -- Relations are forward-only: a row links out through an array of ids under
    -- a `relation` field its collection's `_schema` defines. Removing a record
    -- another row links to would leave that id dangling.
    if exists (
      select 1
        from public.pages p
        join public.pages c on c.id = p.parent_id
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(c.props -> '_schema') = 'array'
            then c.props -> '_schema' else '[]'::jsonb end
        ) as d(def)
       where p.pond_id = p_record.pond_id
         and p.id <> v_row_id
         and d.def ->> 'type' = 'relation'
         and jsonb_typeof(p.props -> (d.def ->> 'id')) = 'array'
         and (p.props -> (d.def ->> 'id')) @> jsonb_build_array(v_row_id::text)
    ) then
      raise exception 'record % is linked from another record', v_row_id
        using errcode = 'P0001', detail = 'linked-elsewhere';
    end if;
    delete from public.pages where id = v_row_id;
    return jsonb_build_object('order', v_row."order", 'createdAt', v_row.created_at);
  end if;

  update public.pages
  set title = p_to ->> 'title',
      props = ((p_to -> 'values') - '_schema')
        || case when v_row.props ? '_schema'
             then jsonb_build_object('_schema', v_row.props -> '_schema')
             else '{}'::jsonb
           end,
      updated_at = now()
  where id = v_row_id;
  return null;
end;
$$;

commit;
