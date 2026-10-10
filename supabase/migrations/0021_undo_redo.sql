-- ─── Undo and redo as change-log records (KAN-93) ───────────────────────────
--
-- `Pond 07.02` (from 6o frame 5): "The undo is a record of its own, and the
-- record it undid is marked undone." "redo ⇧⌘Z is a record too." AUDIT C1: undo
-- covers the session, until the tab or app closes; after that, revert from the
-- change log. 0011 already reserved everything this needs — the `undone` status,
-- the `undo` / `redo` actions, the `undo_of` / `redo_of` links — and nothing ever
-- wrote any of them.
--
-- One UNDO STEP may be several records (one tick that made two), and it lands
-- whole or not at all. Per record, in one transaction:
--
--   undo  X (accepted): page is X.after?   → write X.before; insert U {undo,
--         accepted, before X.after, after X.before, undo_of X}; X → undone.
--   redo  X (undone):   page is X.before?  → write X.after;  insert R {redo,
--         accepted, before X.before, after X.after, redo_of X}; the undo U that
--         took X back → undone. Redo is the undo of the undo, so U is the record
--         it takes back; X stays undone and R is what now stands. R is an ordinary
--         accepted record, so it can itself be undone (and redone).
--
-- The compare-and-swap is on the state the record says it left, read off the
-- record itself — the caller passes ids, never content, so it cannot write
-- anything through these functions that the log does not already say. A page
-- that moved since raises `serialization_failure` and nothing is written.
--
-- WHAT CAN BE SET BACK is decided by the snapshot's shape, so an undo or redo
-- record (which carries its original's snapshots swapped) is handled the same way
-- as the record it came from:
--   * block arrays (`edit`, `revert`)          → `pages.blocks` of the target page
--   * record snapshots (`add_row`, `edit_row`) → the row's title and values; an
--     added record is removed on undo and inserted again, same id, on redo
-- Anything else refuses in words, and stays revertible from the change log.
--
-- SECURITY. These run as the CALLER (no SECURITY DEFINER), like 0014's
-- `accept_revert_record`: row-level security confines every read and write to the
-- caller's own records and pages, so a record that is not theirs is "not found".
-- On top of that, every record must belong to the pond the caller names, so a
-- session stack can never reach across ponds (`s6m5`). The 0011 append-only
-- trigger is untouched and binding: originals only advance, with one appended
-- transition each; nothing else on them changes.
--
-- Independent of 0022 (pages.area_role, ponds.recent_glyphs) and safe to apply
-- after it: no table, column or existing function changes here.
--
-- Down (manual):
--   drop function if exists public.redo_change_log_record(uuid[], uuid, text);
--   drop function if exists public.undo_change_log_record(uuid[], uuid, text);
--   drop function if exists public.change_log_set_back(public.change_log, jsonb, jsonb, text);
--   drop function if exists public.change_log_is_row_snapshot(jsonb);
--   drop index if exists public.change_log_undo_of_idx;

begin;

-- Redo finds the undo it takes back through the link 0011 froze on it.
create index if not exists change_log_undo_of_idx
  on public.change_log ((links ->> 'undo_of'))
  where links ? 'undo_of';

-- A `RowSnapshot` (src/lib/change-log/types.ts) whose id is a page id.
create or replace function public.change_log_is_row_snapshot(p jsonb)
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

-- Move what `p_record` changed from `p_from` to `p_to`, or raise. The one place
-- the compare-and-swap lives, shared by undo and redo so the two cannot drift.
-- It stays executable by `authenticated` because the RPCs run as their caller;
-- running as the caller too, it can write nothing RLS would not let them write.
create or replace function public.change_log_set_back(
  p_record public.change_log,
  p_from jsonb,
  p_to jsonb,
  p_verb text
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_blocks jsonb;
  v_row public.pages;
  v_row_id uuid;
begin
  if jsonb_typeof(p_from) = 'array' and jsonb_typeof(p_to) = 'array' then
    select blocks into v_blocks from public.pages
      where id = p_record.target_page_id
        and user_id = p_record.user_id
        and pond_id is not distinct from p_record.pond_id
      for update;
    if not found then
      raise exception 'change_log record %: the page it changed is gone', p_record.id
        using errcode = 'no_data_found';
    end if;
    if v_blocks is distinct from p_from then
      raise exception 'page % changed since change_log record %, so it cannot be %',
        p_record.target_page_id, p_record.id, p_verb
        using errcode = 'serialization_failure';
    end if;
    update public.pages set blocks = p_to, updated_at = now()
      where id = p_record.target_page_id;
    return;
  end if;

  if not (
    (p_from is null or public.change_log_is_row_snapshot(p_from))
    and (p_to is null or public.change_log_is_row_snapshot(p_to))
    and (p_from is not null or p_to is not null)
    and (p_from is null or p_to is null or p_from ->> 'id' = p_to ->> 'id')
  ) then
    raise exception 'change_log record %: a % cannot be %; revert it from the change log',
      p_record.id, p_record.action, p_verb
      using errcode = 'feature_not_supported';
  end if;

  -- The database the record belongs to, locked so it cannot go mid-step.
  perform 1 from public.pages
    where id = p_record.target_page_id
      and user_id = p_record.user_id
      and pond_id is not distinct from p_record.pond_id
    for update;
  if not found then
    raise exception 'change_log record %: the page it changed is gone', p_record.id
      using errcode = 'no_data_found';
  end if;

  v_row_id := coalesce(p_from ->> 'id', p_to ->> 'id')::uuid;
  select * into v_row from public.pages where id = v_row_id for update;

  if p_from is null then
    if found then
      raise exception 'record % is already back, so change_log record % cannot be %',
        v_row_id, p_record.id, p_verb
        using errcode = 'serialization_failure';
    end if;
    insert into public.pages (id, user_id, pond_id, parent_id, type, title, props)
    values (
      v_row_id, p_record.user_id, p_record.pond_id, p_record.target_page_id, 'row',
      p_to ->> 'title', (p_to -> 'values') - '_schema'
    );
    return;
  end if;

  if not found
     or v_row.parent_id is distinct from p_record.target_page_id
     or v_row.user_id is distinct from p_record.user_id
     or v_row.pond_id is distinct from p_record.pond_id
     or v_row.title is distinct from p_from ->> 'title'
     or (v_row.props - '_schema') is distinct from (p_from -> 'values')
  then
    raise exception 'record % changed since change_log record %, so it cannot be %',
      v_row_id, p_record.id, p_verb
      using errcode = 'serialization_failure';
  end if;

  if p_to is null then
    -- Removing an added record must not take anything written into it since.
    if v_row.blocks is distinct from '[]'::jsonb
       or exists (select 1 from public.pages where parent_id = v_row_id)
    then
      raise exception 'record % has had more written into it since change_log record %, so it cannot be %',
        v_row_id, p_record.id, p_verb
        using errcode = 'serialization_failure';
    end if;
    delete from public.pages where id = v_row_id;
    return;
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
end;
$$;

-- ── Undo ─────────────────────────────────────────────────────────────────────

create or replace function public.undo_change_log_record(
  p_record_ids uuid[],
  p_pond_id uuid,
  p_actor text default 'you'
)
returns setof public.change_log
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_missing uuid;
  v_ids uuid[];
  v_id uuid;
  v_original public.change_log;
  v_undo public.change_log;
  v_now timestamptz := now();
begin
  if p_record_ids is null or cardinality(p_record_ids) = 0 then
    raise exception 'nothing to undo' using errcode = 'invalid_parameter_value';
  end if;
  if p_pond_id is null then
    raise exception 'an undo needs the pond it happens in' using errcode = 'invalid_parameter_value';
  end if;

  select x into v_missing from unnest(p_record_ids) as x
    where not exists (select 1 from public.change_log c where c.id = x)
    limit 1;
  if found then
    raise exception 'change_log record % not found', v_missing using errcode = 'no_data_found';
  end if;

  -- Newest first, so records of one step that touched the same thing each find
  -- the state the next-newer one set back to.
  select array_agg(s.id order by s.created_at desc, s.id desc) into v_ids
    from (
      select id, created_at from public.change_log
        where id = any(p_record_ids)
        for update
    ) s;

  foreach v_id in array v_ids loop
    select * into v_original from public.change_log where id = v_id;
    if v_original.pond_id is distinct from p_pond_id then
      raise exception 'change_log record % is not in this pond', v_id
        using errcode = 'invalid_parameter_value';
    end if;
    if v_original.status <> 'accepted' then
      raise exception 'change_log record % is %, only an accepted record can be undone',
        v_id, v_original.status
        using errcode = 'invalid_parameter_value';
    end if;

    perform public.change_log_set_back(v_original, v_original."after", v_original."before", 'undone');

    insert into public.change_log
      (user_id, pond_id, status, action, actor, target_page_id, target_block_id,
       "before", "after", links, transitions, created_at, status_at)
    values (
      v_original.user_id, v_original.pond_id, 'accepted', 'undo', p_actor,
      v_original.target_page_id, v_original.target_block_id,
      v_original."after", v_original."before",
      jsonb_build_object('undo_of', v_original.id),
      jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
      v_now, v_now
    )
    returning * into v_undo;

    update public.change_log
    set status = 'undone',
        status_at = v_now,
        transitions = transitions
          || jsonb_build_array(jsonb_build_object('status', 'undone', 'at', v_now, 'actor', p_actor))
    where id = v_original.id;

    return next v_undo;
  end loop;
end;
$$;

grant execute on function public.undo_change_log_record(uuid[], uuid, text) to authenticated;

-- ── Redo ─────────────────────────────────────────────────────────────────────

create or replace function public.redo_change_log_record(
  p_record_ids uuid[],
  p_pond_id uuid,
  p_actor text default 'you'
)
returns setof public.change_log
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_missing uuid;
  v_ids uuid[];
  v_id uuid;
  v_original public.change_log;
  v_undo public.change_log;
  v_redo public.change_log;
  v_now timestamptz := now();
begin
  if p_record_ids is null or cardinality(p_record_ids) = 0 then
    raise exception 'nothing to redo' using errcode = 'invalid_parameter_value';
  end if;
  if p_pond_id is null then
    raise exception 'a redo needs the pond it happens in' using errcode = 'invalid_parameter_value';
  end if;

  select x into v_missing from unnest(p_record_ids) as x
    where not exists (select 1 from public.change_log c where c.id = x)
    limit 1;
  if found then
    raise exception 'change_log record % not found', v_missing using errcode = 'no_data_found';
  end if;

  -- Oldest first: the order the step was made in.
  select array_agg(s.id order by s.created_at asc, s.id asc) into v_ids
    from (
      select id, created_at from public.change_log
        where id = any(p_record_ids)
        for update
    ) s;

  foreach v_id in array v_ids loop
    select * into v_original from public.change_log where id = v_id;
    if v_original.pond_id is distinct from p_pond_id then
      raise exception 'change_log record % is not in this pond', v_id
        using errcode = 'invalid_parameter_value';
    end if;
    if v_original.status <> 'undone' then
      raise exception 'change_log record % is %, only an undone record can be redone',
        v_id, v_original.status
        using errcode = 'invalid_parameter_value';
    end if;

    select * into v_undo from public.change_log
      where links ->> 'undo_of' = v_original.id::text
        and action = 'undo'
        and status = 'accepted'
        and pond_id is not distinct from v_original.pond_id
      order by created_at desc
      limit 1
      for update;
    if not found then
      raise exception 'change_log record % has no standing undo to take back', v_id
        using errcode = 'invalid_parameter_value';
    end if;

    perform public.change_log_set_back(v_original, v_original."before", v_original."after", 'redone');

    insert into public.change_log
      (user_id, pond_id, status, action, actor, target_page_id, target_block_id,
       "before", "after", links, transitions, created_at, status_at)
    values (
      v_original.user_id, v_original.pond_id, 'accepted', 'redo', p_actor,
      v_original.target_page_id, v_original.target_block_id,
      v_original."before", v_original."after",
      jsonb_build_object('redo_of', v_original.id),
      jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
      v_now, v_now
    )
    returning * into v_redo;

    update public.change_log
    set status = 'undone',
        status_at = v_now,
        transitions = transitions
          || jsonb_build_array(jsonb_build_object('status', 'undone', 'at', v_now, 'actor', p_actor))
    where id = v_undo.id;

    return next v_redo;
  end loop;
end;
$$;

grant execute on function public.redo_change_log_record(uuid[], uuid, text) to authenticated;

commit;
