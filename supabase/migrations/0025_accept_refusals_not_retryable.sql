-- ─── Accept/reject CAS refusals stop using a retryable errcode ───────────────
--
-- Why: PostgREST treats SQLSTATE 40001 (serialization_failure) as retryable
-- and re-runs the whole request's transaction forever. The same hang 0024
-- fixed for undo/redo is still live here, in two places:
--   * `advance_change_log_record`'s status CAS raises 40001 when a diff's
--     status moved underneath an accept or reject (the same diff open in two
--     tabs, or a double accept).
--   * `accept_revert_record`'s page CAS raises 40001 when the target page's
--     blocks changed underneath a planned revert.
-- Retrying never helps either refusal — the thing compared against has
-- already changed — it only holds a connection open long after the client
-- has disconnected.
--
-- What changed: both CAS refusals' `errcode = 'serialization_failure'` become
-- `errcode = 'P0001'` with a `detail` (`'record-changed'`, `'page-changed'`) —
-- raise_exception, not retried by PostgREST. The message text is unchanged.
-- DETAIL is the contract the client reads (`src/lib/change-log/store.ts`,
-- `src/lib/change-log/revert.ts`). Everything else — locks, security,
-- search_path, every other errcode — is 0011's and 0021's bodies verbatim.
--
-- Down (manual): re-run 0011's `create or replace function
--   public.advance_change_log_record`, and 0021's `create or replace function
--   public.accept_revert_record`.

begin;

create or replace function public.advance_change_log_record(
  p_record_id uuid,
  p_from text,
  p_to text,
  p_actor text default 'you'
)
returns public.change_log
language plpgsql
as $$
declare
  v_record public.change_log;
  v_now timestamptz := now();
begin
  select * into v_record from public.change_log where id = p_record_id for update;
  if not found then
    raise exception 'change_log record % not found', p_record_id
      using errcode = 'no_data_found';
  end if;
  if v_record.status <> p_from then
    raise exception
      'change_log record % is no longer %, it is % — expected status changed underneath this advance',
      p_record_id, p_from, v_record.status
      using errcode = 'P0001', detail = 'record-changed';
  end if;

  update public.change_log
  set status = p_to,
      status_at = v_now,
      transitions = transitions
        || jsonb_build_array(jsonb_build_object('status', p_to, 'at', v_now, 'actor', p_actor))
  where id = p_record_id
  returning * into v_record;

  return v_record;
end;
$$;

-- ── accept_revert_record, locking in the shared order ───────────────────────
--
-- The revert and the record it reverts are locked in one statement ordered by id
-- (see LOCKS above), then read. The `revert_of` link is frozen by the append-only
-- trigger, so it can be read before the lock.

create or replace function public.accept_revert_record(
  p_record_id uuid,
  p_blocks jsonb,
  p_expected jsonb,
  p_actor text default 'you'
)
returns public.change_log
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_revert public.change_log;
  v_original public.change_log;
  v_original_id uuid;
  v_link text;
  v_blocks jsonb;
  v_now timestamptz := now();
begin
  v_link := (select links ->> 'revert_of' from public.change_log where id = p_record_id);
  if v_link ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_original_id := v_link::uuid;
  end if;
  perform 1 from public.change_log
    where id = any(array[p_record_id, v_original_id])
    order by id
    for update;

  select * into v_revert from public.change_log where id = p_record_id;
  if not found then
    raise exception 'change_log record % not found', p_record_id
      using errcode = 'no_data_found';
  end if;
  if v_revert.action <> 'revert' then
    raise exception 'change_log record % is a %, not a revert', p_record_id, v_revert.action
      using errcode = 'invalid_parameter_value';
  end if;
  if v_revert.status <> 'proposed' then
    raise exception 'change_log record % is %, only a proposed revert can be accepted',
      p_record_id, v_revert.status
      using errcode = 'invalid_parameter_value';
  end if;
  if v_revert.target_page_id is null then
    raise exception 'change_log record % has no target page to commit to', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- A page holds an ORDERED ARRAY of blocks. Anything else is not a page, and
  -- writing it would leave content no reader can parse.
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception
      'change_log record %: a revert must write an array of blocks, not %',
      p_record_id, coalesce(jsonb_typeof(p_blocks), 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  if v_link is null then
    raise exception 'change_log record % is a revert with no revert_of link', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;
  if v_original_id is null then
    raise exception 'change_log record %: revert_of link % is not a record id', p_record_id, v_link
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_original from public.change_log where id = v_original_id;
  if not found then
    raise exception 'change_log record %: the record it reverts (%) is gone',
      p_record_id, v_original_id
      using errcode = 'no_data_found';
  end if;
  if v_original.user_id <> v_revert.user_id or v_original.pond_id <> v_revert.pond_id then
    raise exception 'change_log record %: the record it reverts is in another pond', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;
  -- `accepted → reverted` is the only way out of `accepted` a revert may take, so
  -- anything else means this change was already taken back — by another revert,
  -- or by an undo.
  if v_original.status <> 'accepted' then
    raise exception
      'change_log record %: the change this reverts was already taken back (it is %)',
      p_record_id, v_original.status
      using errcode = 'invalid_parameter_value';
  end if;

  select blocks into v_blocks from public.pages
    where id = v_revert.target_page_id and user_id = v_revert.user_id
    for update;
  if not found then
    raise exception 'target page % of change_log record % no longer exists',
      v_revert.target_page_id, p_record_id
      using errcode = 'no_data_found';
  end if;
  if v_blocks is distinct from p_expected then
    raise exception
      'page % changed underneath the revert planned for change_log record %',
      v_revert.target_page_id, p_record_id
      using errcode = 'P0001', detail = 'page-changed';
  end if;

  update public.pages
  set blocks = p_blocks, updated_at = v_now
  where id = v_revert.target_page_id and user_id = v_revert.user_id;

  update public.change_log
  set status = 'accepted',
      status_at = v_now,
      transitions = transitions
        || jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor))
  where id = v_revert.id
  returning * into v_revert;

  update public.change_log
  set status = 'reverted',
      status_at = v_now,
      transitions = transitions
        || jsonb_build_array(jsonb_build_object('status', 'reverted', 'at', v_now, 'actor', p_actor))
  where id = v_original.id;

  return v_revert;
end;
$$;

commit;
