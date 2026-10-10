-- ─── Undo and redo as change-log records (KAN-93) ───────────────────────────
--
-- `Pond 07.02` (from 6o frame 5): "The undo is a record of its own, and the
-- record it undid is marked undone." "redo ⇧⌘Z is a record too." AUDIT C1: undo
-- covers the session; after that, revert from the change log.
--
-- One step may be several records (one tick that made two). It lands whole or
-- not at all. Per record:
--
--   undo  X (accepted): target is X.after?  → write X.before; insert U {undo,
--         accepted, before X.after, after X.before, undo_of X}; X → undone.
--   redo  X (undone):   target is X.before? → write X.after;  insert R {redo,
--         accepted, before X.before, after X.after, redo_of X}; the standing undo
--         U of X → undone. X stays undone; R stands, and can itself be undone.
--
-- The compare-and-swap reads the expected state off the record; callers pass
-- ids, never content. Every refusal carries a machine-readable DETAIL (the
-- client's reason codes, src/lib/change-log/undo.ts) and writes nothing:
--   40001 page-changed | record-changed | linked-elsewhere
--   22023 already-undone | not-undone | other-pond | not-found
--   P0002 not-found | page-gone      0A000 not-undoable      23505 name-taken
--
-- WHAT CAN BE SET BACK is decided by the record's ACTION (a `redo` by the action
-- of the record it redoes): `edit` → the page's blocks; `add_row` / `edit_row` →
-- the record's title and values, an added record removed on undo and put back,
-- same id, order and creation time, on redo. Everything else is `not-undoable` —
-- including `revert` and `undo`, whose taken-back record would stay `reverted` /
-- `undone` with its change back on the page (statuses only move forward); the
-- path for those is a revert, which is a new record.
--
-- Pending diffs the step makes stale go `outdated` in the same transaction:
-- `proposed` `edit`/`revert` on a moved page, `proposed` `edit_row` on a moved
-- record. (`changes_requested` is terminal — status.ts — so it is left alone.)
--
-- Locks are always taken in one order, each set by id: the step's records, the
-- undos a redo takes back, the pending diffs on what the step touches, the pages.
--
-- SECURITY. Everything runs as the CALLER, like 0014: RLS confines reads and
-- writes to the caller's own records and pages, so another person's record is
-- `not-found`. Every record must also be in the pond the caller names. The
-- helpers live in `private`, which PostgREST does not expose.
--
-- Down (manual):
--   drop function if exists public.redo_change_log_record(uuid[], uuid, text);
--   drop function if exists public.undo_change_log_record(uuid[], uuid, text);
--   drop schema if exists private cascade;
--   drop index if exists public.change_log_undo_of_idx;

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create index if not exists change_log_undo_of_idx
  on public.change_log ((links ->> 'undo_of'))
  where links ? 'undo_of';

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- A `RowSnapshot` (src/lib/change-log/types.ts) whose id is a page id.
create or replace function private.change_log_is_row_snapshot(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_typeof(p) = 'object'
      and jsonb_typeof(p -> 'id') = 'string'
      and (p ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p -> 'title') = 'string'
      and jsonb_typeof(p -> 'values') = 'object',
    false
  )
$$;

-- 'blocks', 'row', or null when the record cannot be undone or redone.
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
    when 'add_row' then 'row'
    when 'edit_row' then 'row'
  end;
end;
$$;

-- Move what `p_record` changed from `p_from` to `p_to`, or raise. Returns where a
-- removed record sat ({order, createdAt}); `p_position` puts a record back there.
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
begin
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
        using errcode = 'serialization_failure', detail = 'page-changed';
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
        using errcode = 'serialization_failure', detail = 'record-changed';
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
      using errcode = 'serialization_failure', detail = 'record-changed';
  end if;

  if p_to is null then
    if v_row.blocks is distinct from '[]'::jsonb
       or exists (select 1 from public.pages where parent_id = v_row_id)
    then
      raise exception 'record % has had more written into it since change_log record %',
        v_row_id, p_record.id
        using errcode = 'serialization_failure', detail = 'record-changed';
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
       where p.id <> v_row_id
         and d.def ->> 'type' = 'relation'
         and jsonb_typeof(p.props -> (d.def ->> 'id')) = 'array'
         and (p.props -> (d.def ->> 'id')) @> jsonb_build_array(v_row_id::text)
    ) then
      raise exception 'record % is linked from another record', v_row_id
        using errcode = 'serialization_failure', detail = 'linked-elsewhere';
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

-- One undo (p_redo false) or redo (p_redo true) step. See the header.
create or replace function private.change_log_step(
  p_record_ids uuid[],
  p_pond_id uuid,
  p_actor text,
  p_redo boolean
)
returns setof public.change_log
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_missing uuid;
  v_targets uuid[];
  v_rows text[];
  v_ids uuid[];
  v_id uuid;
  v_record public.change_log;
  v_undo public.change_log;
  v_made public.change_log;
  v_kind text;
  v_from jsonb;
  v_to jsonb;
  v_position jsonb;
  v_moved_pages uuid[] := '{}';
  v_moved_rows text[] := '{}';
  v_now timestamptz := now();
begin
  if p_record_ids is null or cardinality(p_record_ids) = 0 or p_pond_id is null then
    raise exception 'a step needs its records and the pond they are in'
      using errcode = 'invalid_parameter_value', detail = 'not-found';
  end if;

  select x into v_missing from unnest(p_record_ids) as x
    where not exists (select 1 from public.change_log c where c.id = x)
    limit 1;
  if found then
    raise exception 'change_log record % not found', v_missing
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  perform 1 from public.change_log where id = any(p_record_ids) order by id for update;

  if p_redo then
    perform 1 from public.change_log
      where links ? 'undo_of'
        and links ->> 'undo_of' = any(p_record_ids::text[])
        and action = 'undo'
        and status = 'accepted'
      order by id
      for update;
  end if;

  select array_agg(distinct c.target_page_id) filter (where c.target_page_id is not null)
    into v_targets
    from public.change_log c where c.id = any(p_record_ids);
  select array_agg(distinct s.snap ->> 'id')
    into v_rows
    from public.change_log c
    cross join lateral (values (c."before"), (c."after")) as s(snap)
   where c.id = any(p_record_ids) and private.change_log_is_row_snapshot(s.snap);

  perform 1 from public.change_log
    where status = 'proposed'
      and ((action in ('edit', 'revert') and target_page_id = any(v_targets))
        or (action = 'edit_row' and "before" ->> 'id' = any(v_rows)))
    order by id
    for update;

  perform 1 from public.pages
    where id = any(v_targets) or id::text = any(v_rows)
    order by id
    for update;

  -- Undo newest first, redo oldest first, so records of one step that touched the
  -- same thing each find the state the one before them left.
  if p_redo then
    select array_agg(id order by created_at asc, id asc) into v_ids
      from public.change_log where id = any(p_record_ids);
  else
    select array_agg(id order by created_at desc, id desc) into v_ids
      from public.change_log where id = any(p_record_ids);
  end if;

  foreach v_id in array v_ids loop
    select * into v_record from public.change_log where id = v_id;
    if v_record.pond_id is distinct from p_pond_id then
      raise exception 'change_log record % is not in this pond', v_id
        using errcode = 'invalid_parameter_value', detail = 'other-pond';
    end if;
    if not p_redo and v_record.status <> 'accepted' then
      raise exception 'change_log record % is %, only an accepted record can be undone',
        v_id, v_record.status
        using errcode = 'invalid_parameter_value', detail = 'already-undone';
    end if;
    if p_redo and v_record.status <> 'undone' then
      raise exception 'change_log record % is %, only an undone record can be redone',
        v_id, v_record.status
        using errcode = 'invalid_parameter_value', detail = 'not-undone';
    end if;

    v_kind := private.change_log_undo_kind(v_record);
    if v_kind is null then
      raise exception 'change_log record %: a % cannot be undone or redone', v_id, v_record.action
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    if p_redo then
      select * into v_undo from public.change_log
        where links ? 'undo_of'
          and links ->> 'undo_of' = v_id::text
          and action = 'undo'
          and status = 'accepted'
          and pond_id is not distinct from v_record.pond_id
        order by created_at desc
        limit 1;
      if not found then
        raise exception 'change_log record % has no standing undo to take back', v_id
          using errcode = 'invalid_parameter_value', detail = 'not-undone';
      end if;
      v_from := v_record."before";
      v_to := v_record."after";
      v_position := v_undo."before" -> 'position';
    else
      v_from := v_record."after";
      v_to := v_record."before";
      v_position := null;
    end if;

    v_position := private.change_log_set_back(v_record, v_kind, v_from, v_to, v_position);

    insert into public.change_log
      (user_id, pond_id, status, action, actor, target_page_id, target_block_id,
       "before", "after", links, transitions, created_at, status_at)
    values (
      v_record.user_id, v_record.pond_id, 'accepted',
      case when p_redo then 'redo' else 'undo' end,
      p_actor, v_record.target_page_id, v_record.target_block_id,
      case when v_position is null then v_from
        else v_from || jsonb_build_object('position', v_position) end,
      v_to,
      jsonb_build_object(case when p_redo then 'redo_of' else 'undo_of' end, v_id),
      jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
      v_now, v_now
    )
    returning * into v_made;

    update public.change_log
    set status = 'undone',
        status_at = v_now,
        transitions = transitions
          || jsonb_build_array(jsonb_build_object('status', 'undone', 'at', v_now, 'actor', p_actor))
    where id = case when p_redo then v_undo.id else v_id end;

    if v_kind = 'blocks' then
      v_moved_pages := array_append(v_moved_pages, v_record.target_page_id);
    else
      v_moved_rows := array_append(v_moved_rows, coalesce(v_from ->> 'id', v_to ->> 'id'));
    end if;

    return next v_made;
  end loop;

  update public.change_log c
  set status = 'outdated',
      status_at = v_now,
      transitions = c.transitions
        || jsonb_build_array(jsonb_build_object('status', 'outdated', 'at', v_now, 'actor', p_actor))
  where c.status = 'proposed'
    and c.pond_id is not distinct from p_pond_id
    and (
      (c.action in ('edit', 'revert')
        and c.target_page_id = any(v_moved_pages)
        and c."before" is distinct from (select p.blocks from public.pages p where p.id = c.target_page_id))
      or (c.action = 'edit_row'
        and c."before" ->> 'id' = any(v_moved_rows)
        and not exists (
          select 1 from public.pages r
           where r.id::text = c."before" ->> 'id'
             and r.title = c."before" ->> 'title'
             and (r.props - '_schema') = c."before" -> 'values'
        ))
    );
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ── The two RPCs ─────────────────────────────────────────────────────────────

create or replace function public.undo_change_log_record(
  p_record_ids uuid[],
  p_pond_id uuid,
  p_actor text default 'you'
)
returns setof public.change_log
language sql
set search_path = public, pg_temp
as $$
  select * from private.change_log_step(p_record_ids, p_pond_id, p_actor, false)
$$;

create or replace function public.redo_change_log_record(
  p_record_ids uuid[],
  p_pond_id uuid,
  p_actor text default 'you'
)
returns setof public.change_log
language sql
set search_path = public, pg_temp
as $$
  select * from private.change_log_step(p_record_ids, p_pond_id, p_actor, true)
$$;

grant execute on function public.undo_change_log_record(uuid[], uuid, text) to authenticated;
grant execute on function public.redo_change_log_record(uuid[], uuid, text) to authenticated;

commit;
