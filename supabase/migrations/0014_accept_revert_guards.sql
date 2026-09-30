-- ─── Guards on accept_revert_record (issue #103, review round three) ─────────
--
-- 0013 shipped the three-write accept. Two holes in it, both found by probing
-- rather than reading, neither reachable through the app today — which is the
-- same thing 0011 said about TRUNCATE before it closed it: "this file claims the
-- log can never be emptied, and a claim with a hole in it is worse than no
-- claim." The application is not the only writer a database has.
--
-- 1. `p_blocks` was written to `pages.blocks` unexamined. `pages.blocks` is
--    NOT NULL, so a null raises on its own — but a non-array jsonb does not.
--    Probed: `'"not blocks"'::jsonb` landed in the column, leaving a page whose
--    content no reader can parse. The app always passes the record's `after`,
--    and 0011's append-only trigger permits `after` to be redacted to null
--    independently of `before`, so a record can legitimately reach this function
--    with nothing to write. That must be a refusal, not a corrupted page.
--
-- 2. When the record being reverted is not `accepted`, 0013 raised a message
--    written for the only case that existed then. #104 makes `undone` reachable:
--    undo stamps a record, and any revert already `proposed` against it keeps a
--    live Accept whose failure reads as a raw Postgres string. The refusal is
--    correct — `accepted → reverted` is the only edge out — so this only says so
--    in words the surface can show, and names the status it found.
--
-- Replaces the function in place; no table, data or signature change.
--
-- Down (manual): re-run 0013's body.

begin;

create or replace function public.accept_revert_record(
  p_record_id uuid,
  p_blocks jsonb,
  p_expected jsonb,
  p_actor text default 'you'
)
returns public.change_log
language plpgsql
as $$
declare
  v_revert public.change_log;
  v_original public.change_log;
  v_original_id uuid;
  v_link text;
  v_blocks jsonb;
  v_now timestamptz := now();
begin
  select * into v_revert from public.change_log where id = p_record_id for update;
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
  -- writing it would leave content no reader can parse (round three).
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception
      'change_log record %: a revert must write an array of blocks, not %',
      p_record_id, coalesce(jsonb_typeof(p_blocks), 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  v_link := v_revert.links ->> 'revert_of';
  if v_link is null then
    raise exception 'change_log record % is a revert with no revert_of link', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;
  if v_link !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'change_log record %: revert_of link % is not a record id', p_record_id, v_link
      using errcode = 'invalid_parameter_value';
  end if;
  v_original_id := v_link::uuid;

  select * into v_original from public.change_log where id = v_original_id for update;
  if not found then
    raise exception 'change_log record %: the record it reverts (%) is gone',
      p_record_id, v_original_id
      using errcode = 'no_data_found';
  end if;
  if v_original.user_id <> v_revert.user_id or v_original.workspace <> v_revert.workspace then
    raise exception 'change_log record %: the record it reverts is in another pond', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;
  -- `accepted → reverted` is the only edge out of `accepted`, so anything else
  -- means this change was already taken back — by another revert, or by #104's
  -- undo, which makes `undone` reachable here.
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
      using errcode = 'serialization_failure';
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

grant execute on function public.accept_revert_record(uuid, jsonb, jsonb, text) to authenticated;

commit;
