-- ─── Accepting a revert (issue #103, spec #110 — direction LOCKED = Option A) ──
--
-- Design law (`wayfinder/design_handoff_pond/Pond 06.15 Change log.dc.html`,
-- frame 4): "Revert doesn't rewrite history. It adds a new proposed diff that
-- sets the block back, and links the two records." — "revert goes through accept
-- like any change."
--
-- So a revert is an ordinary `proposed` record and accepting it is an ordinary
-- accept, with ONE extra obligation: the record it reverts advances
-- `accepted → reverted` at the same moment. That is three writes — the page, the
-- revert, and the original — and they have to be one transaction for the reason
-- spec #110 criterion 3 gives ("never an accepted record without the committed
-- block, nor a committed block without the record"), with a third party to keep
-- in step. Two PostgREST round-trips could leave the page set back and the
-- original still reading `accepted`, and since the log only grows that
-- disagreement would be PERMANENT: `accepted → reverted` is the only edge out of
-- `accepted`, and a later repair would have to rewrite history to fix it.
--
-- `accept_change_log_record` (0011) is the same shape for a plain block accept;
-- this is the two-record version. It is a SEPARATE function rather than a flag on
-- that one because its preconditions differ (the link must resolve, the original
-- must still be `accepted`) and because 0011's function is already relied on.
--
-- WHY THE STATUS MACHINE IS NOT DUPLICATED HERE. `src/lib/change-log/status.ts`
-- owns which status may follow which (spec #110 §3 puts the machine in the write
-- layer). Like `accept_change_log_record`, this function hard-codes the two edges
-- it walks — `proposed → accepted` on the revert and `accepted → reverted` on the
-- original — because accepting is the one advance that must commit a page write in
-- the same transaction and so cannot take the caller's word for either status.
--
-- LOCK ORDER. The revert is locked first, then the record it reverts. Every other
-- writer in this schema (`advance_change_log_record`, `accept_change_log_record`)
-- locks a single row, so nothing can hold the original while waiting on the
-- revert; keeping this order means two concurrent accepts of the same revert
-- queue rather than deadlock.
--
-- Down (manual, if ever needed):
--   drop function if exists public.accept_revert_record(uuid, jsonb, jsonb, text);

begin;

create or replace function public.accept_revert_record(
  p_record_id uuid,
  -- What the page should hold once the revert lands, planned by the caller
  -- against `p_expected` (src/lib/change-log/revert.ts → planRevert).
  p_blocks jsonb,
  -- The page state the caller planned against. This is a compare-and-swap: a page
  -- that moved underneath the plan raises instead of being clobbered.
  --
  -- It is needed because the caller plans OUTSIDE this transaction, and not every
  -- writer of `pages.blocks` leaves a log record to check against — a person
  -- typing saves through the ordinary debounced path, which logs nothing today
  -- (spec #110 criterion 7 is not built). Without this, a revert accepted a moment
  -- after someone typed would write a block array computed from a page that no
  -- longer existed and silently drop what they wrote. Same discipline as
  -- `advance_change_log_record`'s status CAS, applied to the page.
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
  -- An `outdated` revert has had its accept affordance withdrawn (criterion 5),
  -- and a settled one has already been answered.
  if v_revert.status <> 'proposed' then
    raise exception 'change_log record % is %, only a proposed revert can be accepted',
      p_record_id, v_revert.status
      using errcode = 'invalid_parameter_value';
  end if;
  if v_revert.target_page_id is null then
    raise exception 'change_log record % has no target page to commit to', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- The link is the whole point of a revert record; without it there is nothing to
  -- mark `reverted` and this is not a revert at all. Checked as text before the
  -- cast so a malformed link reports itself rather than surfacing as a bare
  -- invalid_text_representation from deep inside the function.
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
  -- Per-pond scope (spec #110 criterion 11). RLS already confines both reads to
  -- the caller, but this function is reached by id and a cross-pond link would
  -- otherwise advance a record in a workspace the revert does not belong to.
  if v_original.user_id <> v_revert.user_id or v_original.workspace <> v_revert.workspace then
    raise exception 'change_log record %: the record it reverts is in another pond', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;
  -- `accepted → reverted` is the only edge out of `accepted`, so anything else
  -- means this change was already taken back (by another revert, or by #104's
  -- undo) and there is nothing left to revert.
  if v_original.status <> 'accepted' then
    raise exception 'change_log record %: the record it reverts is %, not accepted',
      p_record_id, v_original.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Compare-and-swap on the page. `is distinct from` so a null on either side
  -- compares as a value rather than swallowing the check.
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

  -- The original is marked ONLY now, when the revert actually lands. While the
  -- revert is merely proposed the original still reads `accepted` and the design's
  -- record page shows it as a `reverted by` FIELD — a backlink to the revert, not a
  -- status of its own (storyboard frame 4). A rejected revert therefore leaves the
  -- original standing, which is the only reading `reverted` being terminal allows.
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
