-- ─── Undo/redo CAS refusals stop using a retryable errcode ───────────────────
--
-- Why: PostgREST treats SQLSTATE 40001 (serialization_failure) as retryable
-- and re-runs the whole request's transaction forever. Seen on a local stack:
-- `rpc/undo_change_log_record` for a stale record never returned (pending
-- >90s), pg_stat_database.xact_rollback climbed ~1,800/s, and the loop
-- outlived the client's own disconnect. None of `private.change_log_set_back`'s
-- CAS refusals (page-changed, record-changed, linked-elsewhere) are ever
-- worth retrying — the thing it compared against has already changed, so
-- raising it as 40001 only hangs the request instead of ever giving a client
-- the chance to see the refusal and surface it.
--
-- What changed: every `errcode = 'serialization_failure'` below becomes
-- `errcode = 'P0001'` (raise_exception, not retried by PostgREST). The
-- message text and DETAIL (`page-changed` / `record-changed` /
-- `linked-elsewhere`) are unchanged — DETAIL is the contract the client reads
-- (`src/lib/change-log/undo.ts`). Everything else in the function — the other
-- errcodes, the locks, the security, the logic — is 0023's body verbatim.
--
-- Down (manual): re-run 0023's `create or replace function
--   private.change_log_set_back`.

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
       or exists (select 1 from public.pages where parent_id = v_row_id)
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
