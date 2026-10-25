-- ─── Part a: `change_log_undo_kind` learns `restore` (KAN-497) ─────────────
--
-- Why: a `restore` record (0027's `restore_page`) raised `0A000 not-undoable`
-- (0021's unlisted-action default) because `change_log_undo_kind`'s case
-- never named it. Classifying it as its own kind, `restore` (not reusing
-- `page` — `page`'s redo is hard-refused by design (0029), but this record's
-- own redo must actually restore again), is the one step this part owns;
-- `change_log_set_back` still carries no `restore` branch until part b.
--
-- Re-created from 0032's body verbatim (the latest redefinition), adding
-- only the `restore` arm.
--
-- Down (manual): re-run 0032's `create or replace function
--   private.change_log_undo_kind` to drop the `restore` arm.

begin;

create or replace function private.change_log_undo_kind(p_record public.change_log)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_record public.change_log := p_record;
  v_link text;
  v_depth integer := 0;
begin
  while v_record.action = 'redo' loop
    v_link := v_record.links ->> 'redo_of';
    if v_depth >= 1000
       or v_link is null
       or v_link !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      return null;
    end if;
    select * into v_record from public.change_log where id = v_link::uuid;
    if not found then
      return null;
    end if;
    v_depth := v_depth + 1;
  end loop;
  return case v_record.action
    when 'edit' then 'blocks'
    when 'revert' then 'blocks'
    when 'add_row' then 'row'
    when 'edit_row' then 'row'
    when 'edit_glyph' then 'glyph'
    when 'edit_area_role' then 'area_role'
    when 'create_page' then 'page'
    when 'move' then 'move'
    when 'duplicate_page' then 'page'
    when 'restore' then 'restore'
  end;
end;
$$;

commit;

-- ─── Part b: `change_log_set_back` learns kind `restore`, undo direction ───
--
-- Why: part a classified a `restore` record as kind `restore`, but
-- `change_log_set_back` carried no `restore` branch — every undo attempt
-- still fell through to the bottom, generic row-snapshot block (the `restore`
-- record's `after` is a page snapshot, not a row one) and raised a confusing
-- `not-undoable` for the wrong reason. This part's `restore` branch is
-- direction-only: a `restore` record carries `after` alone (never `before`),
-- so `change_log_step` (0021) always calls this with exactly one of
-- `p_from`/`p_to` null — `p_to is null` is undo (`p_from` is the restore
-- snapshot), `p_to is not null` is redo (part c, not yet built here).
--
-- Undo re-trashes the page via `public.trash_page` — the SAME call the
-- `page` kind's own branch (above) already makes for create/duplicate undo,
-- so this gets KAN-448's parent page-link removal for free, since that lives
-- inside `trash_page` itself, not duplicated here.
--
-- `trash_page` inserts its own `delete` record in the same statement; this
-- branch looks it up afterward (`order by created_at desc limit 1`) rather
-- than changing `trash_page`'s signature to return it — safe because
-- `trash_page`'s own `for update` lock on the page row (taken inside the
-- perform above, and still held — this whole call runs in
-- `change_log_step`'s one transaction) means no concurrent trash of this
-- same page can insert a competing `delete` row before this lookup runs. The
-- exact same "query the latest `delete` record for a page" shape already
-- exists in `BlockCanvas.tsx`'s `restoreMadePage` and in this suite's own
-- `change-log-undo-trash.pglite.test.ts` helper (`deleteRecordFor`).
--
-- The found id is returned as `jsonb_build_object('deleteRecordId', v_delete_id)`
-- — `change_log_step` folds this onto the new `undo` record's `before.position`
-- the same way the `row`/`move` kinds already use `p_position` to carry data
-- forward to a later redo (part c reads it back off `p_position ->> 'deleteRecordId'`).
--
-- Redo (`p_to is not null`) stays refused `not-undoable` until part c — the
-- same "not supported yet" shape the `page` kind's own redo already uses,
-- one `if` block below, so a stale client calling redo today gets a clear
-- refusal instead of falling through into the generic row-snapshot code
-- (whose shape checks a page snapshot would fail anyway, but for the wrong,
-- confusing reason).
--
-- Re-created from 0034's body verbatim (0034 is the latest redefinition on
-- origin/main), adding only the `restore` branch and the `v_delete_id`
-- declaration.
--
-- Down (manual): re-run 0034's `create or replace function
--   private.change_log_set_back` to drop the `restore` branch.

begin;

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
  v_idx integer;
  v_link_parent_id uuid;
  v_link_blocks jsonb;
  v_link_removed_index integer;
  v_link_removed_ids text[];
  v_link_entry jsonb;
  v_link_blocks_snapshot jsonb;
  v_delete_id uuid;
begin
  if p_kind = 'move' then
    if not (
      jsonb_typeof(p_from) = 'object' and jsonb_typeof(p_from -> 'siblingOrder') = 'array'
      and jsonb_typeof(p_to) = 'object' and jsonb_typeof(p_to -> 'siblingOrder') = 'array'
    ) then
      raise exception 'change_log record % carries no move to set back', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    select parent_id, title into v_parent_id, v_title from public.pages
      where id = p_record.target_page_id
        and user_id = p_record.user_id
        and pond_id is not distinct from p_record.pond_id;
    if not found then
      raise exception 'change_log record %: the page it moved is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;

    if v_parent_id is distinct from
       (case when p_from ->> 'parentId' is null then null else (p_from ->> 'parentId')::uuid end)
    then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;

    -- A rename made atomically with this move (part A) must still be the
    -- title going in, or something else renamed the page since — the same
    -- staleness rule the parent check above applies, for the same reason.
    -- No-op when the move never carried a `title` key at all.
    if p_from ? 'title' and v_title is distinct from (p_from ->> 'title') then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;

    -- The parent being restored (or re-applied, on redo) to must still be a
    -- live page this record's own user/pond can reach — a trashed or gone
    -- one would otherwise only surface as a raw 23503 off the UPDATE below.
    if p_to ->> 'parentId' is not null and not exists (
      select 1 from public.pages
       where id = (p_to ->> 'parentId')::uuid
         and user_id = p_record.user_id
         and pond_id is not distinct from p_record.pond_id
         and deleted_at is null
    ) then
      raise exception 'change_log record %: the page it moved to is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;

    -- The parent being restored (or re-applied, on redo) to must not be the
    -- moved page itself, or now sit inside the moved page's own subtree —
    -- otherwise this would create a cycle (see the migration header's
    -- UNDO-CYCLE HARDENING note) even though the simple parent_id compare
    -- above found nothing stale.
    if p_to ->> 'parentId' is not null
       and private.page_is_self_or_descendant(
             p_record.target_page_id, (p_to ->> 'parentId')::uuid
           )
    then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;

    update public.pages
       set parent_id =
             case when p_to ->> 'parentId' is null then null else (p_to ->> 'parentId')::uuid end,
           title = coalesce(p_to ->> 'title', title),
           updated_at = now()
     where id = p_record.target_page_id;

    v_idx := 0;
    for v_row_id in select jsonb_array_elements_text(p_to -> 'siblingOrder')::uuid loop
      update public.pages
         set "order" = v_idx, updated_at = now()
       where id = v_row_id and user_id = p_record.user_id;
      v_idx := v_idx + 1;
    end loop;

    -- Remove the link(s) as they now stand (see migration header): an
    -- `appendedLinkId` on `p_from` undoes the forward append by id; every
    -- entry of a `removedLinks` array on `p_from` (redo, undoing an earlier
    -- undo's put-back) removes that same block by the id it was originally
    -- recorded under.
    if p_from ? 'appendedLinkId' or p_from ? 'removedLinks' then
      v_link_parent_id := private.page_link_parent_id(
        case when p_from ->> 'parentId' is null then null else (p_from ->> 'parentId')::uuid end,
        p_record.pond_id, p_record.user_id
      );
      if v_link_parent_id is not null then
        select blocks into v_link_blocks from public.pages
          where id = v_link_parent_id and user_id = p_record.user_id and deleted_at is null
          for update;
        if found then
          select coalesce(array_agg(e -> 'block' ->> 'id'), array[]::text[])
            into v_link_removed_ids
            from jsonb_array_elements(coalesce(p_from -> 'removedLinks', '[]'::jsonb)) as e;
          if p_from ->> 'appendedLinkId' is not null then
            v_link_removed_ids := array_append(v_link_removed_ids, p_from ->> 'appendedLinkId');
          end if;
          update public.pages
             set blocks = (
                   select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                     from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
                    where coalesce((elem ->> 'id') = any(v_link_removed_ids), false) = false
                 ),
                 updated_at = now()
           where id = v_link_parent_id;
        end if;
      end if;
    end if;

    -- Put the link(s) back where they are going to (see migration header): a
    -- `removedLinks` array on `p_to` reinserts every original block at its
    -- recorded index, in ascending index order; an `appendedLinkId` on
    -- `p_to` (redo) rebuilds the appended block and appends it again. Each
    -- reinsert is skipped if a block with that id, or a link to that page,
    -- is already there — the same no-duplicate rule part B applies, in case
    -- the parent's `blocks` picked up its own link to the page in the
    -- meantime.
    if p_to ? 'removedLinks' or p_to ? 'appendedLinkId' then
      v_link_parent_id := private.page_link_parent_id(
        case when p_to ->> 'parentId' is null then null else (p_to ->> 'parentId')::uuid end,
        p_record.pond_id, p_record.user_id
      );
      if v_link_parent_id is not null then
        select blocks into v_link_blocks from public.pages
          where id = v_link_parent_id and user_id = p_record.user_id and deleted_at is null
          for update;
        if found then
          if p_to ? 'removedLinks' then
            -- Duplicate guard checks against the snapshot taken BEFORE this
            -- record's own removed links start coming back, not the array as
            -- it grows across loop iterations — two links this same record
            -- removed (both pointing at the moved page) must not see each
            -- other as "already there" and skip; only a link some OTHER
            -- cause (a manual re-link made between the move and this undo)
            -- added in the meantime should block a reinsert.
            v_link_blocks_snapshot := v_link_blocks;
            for v_link_entry in
              select value from jsonb_array_elements(p_to -> 'removedLinks') as value
              order by (value ->> 'index')::integer asc
            loop
              if not exists (
                select 1 from jsonb_array_elements(v_link_blocks_snapshot) as elem
                 where elem ->> 'id' = (v_link_entry -> 'block' ->> 'id')
                    or (elem ->> 'type' = 'page-link'
                        and elem ->> 'pageId' = (v_link_entry -> 'block' ->> 'pageId'))
              ) then
                v_link_removed_index := (v_link_entry ->> 'index')::integer;
                select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                  into v_link_blocks
                  from (
                    select elem, ord::numeric as ord
                      from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
                    union all
                    select (v_link_entry -> 'block'), v_link_removed_index + 0.5
                  ) s(elem, ord);
              end if;
            end loop;
            update public.pages set blocks = v_link_blocks, updated_at = now()
              where id = v_link_parent_id;
          elsif not exists (
            select 1 from jsonb_array_elements(v_link_blocks) as elem
             where elem ->> 'id' = (p_to ->> 'appendedLinkId')
                or (elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_record.target_page_id::text)
          ) then
            update public.pages
               set blocks = v_link_blocks || jsonb_build_array(
                     jsonb_build_object(
                       'id', p_to ->> 'appendedLinkId', 'type', 'page-link',
                       'pageId', p_record.target_page_id
                     )
                   ),
                   updated_at = now()
             where id = v_link_parent_id;
          end if;
        end if;
      end if;
    end if;

    return null;
  end if;

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

  if p_kind = 'page' then
    if p_from is null then
      -- Redo: restoring a trashed subtree under RLS needs a SECURITY DEFINER
      -- helper to see trashed descendants (the way 0028's page_has_any_child
      -- does for the row kind) — out of this ticket's acceptance criteria.
      raise exception 'change_log record %: redo of a made page is not supported yet', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    -- A duplicate's own appended link (KAN-468): null-safe, the same shape
    -- the `move` branch above uses for its link edits. `appendedLinkId`/
    -- `linkParentId` are both present on `p_from` only when the forward
    -- write actually landed a link (the migration header's own LINK APPEND
    -- tolerance for a parentless pond with no home row yet); absent on
    -- every other `page` record (a plain `create_page`), so this is a no-op
    -- for those.
    if p_from ->> 'appendedLinkId' is not null and p_from ->> 'linkParentId' is not null then
      v_link_parent_id := (p_from ->> 'linkParentId')::uuid;
      select blocks into v_link_blocks from public.pages
        where id = v_link_parent_id and user_id = p_record.user_id and deleted_at is null
        for update;
      if found then
        update public.pages
           set blocks = (
                 select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                   from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
                  where (elem ->> 'id') is distinct from (p_from ->> 'appendedLinkId')
               ),
               updated_at = now()
         where id = v_link_parent_id;
      end if;
    end if;

    begin
      perform public.trash_page(p_record.target_page_id);
    exception
      when no_data_found then
        raise exception 'change_log record %: the page it made is gone', p_record.id
          using errcode = 'no_data_found', detail = 'page-gone';
    end;
    return null;
  end if;

  if p_kind = 'restore' then
    if p_to is not null then
      -- Redo: part c.
      raise exception 'change_log record %: redo of a restore is not supported yet', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    if jsonb_typeof(p_from) is distinct from 'object' then
      raise exception 'change_log record % carries no restore to set back', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    -- Same call the `page` kind's own branch (above) makes for create/
    -- duplicate undo — reuses KAN-448's parent page-link removal for free,
    -- since that lives inside `trash_page` itself.
    begin
      perform public.trash_page(p_record.target_page_id);
    exception
      when no_data_found then
        raise exception 'change_log record %: the page it restored is gone', p_record.id
          using errcode = 'no_data_found', detail = 'page-gone';
    end;

    -- `trash_page`'s own `for update` lock on the page row is still held for
    -- this whole transaction, so no concurrent trash of this page can insert
    -- a competing `delete` row before this lookup runs.
    select id into v_delete_id from public.change_log
      where action = 'delete' and target_page_id = p_record.target_page_id
      order by created_at desc
      limit 1;

    return jsonb_build_object('deleteRecordId', v_delete_id);
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
