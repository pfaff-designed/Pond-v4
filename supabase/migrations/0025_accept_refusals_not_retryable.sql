-- ─── Accept/reject CAS refusal stops using a retryable errcode ───────────────
--
-- Why: PostgREST treats SQLSTATE 40001 (serialization_failure) as retryable
-- and re-runs the whole request's transaction forever. The same hang 0024
-- fixed for undo/redo is still live here: `advance_change_log_record`'s status
-- CAS raises 40001 when a diff's status moved underneath an accept or reject
-- (the same diff open in two tabs, or a double accept) — the status it
-- compared against has already changed, so retrying never helps, it only
-- holds a connection open long after the client has disconnected.
--
-- What changed: the status CAS's `errcode = 'serialization_failure'` becomes
-- `errcode = 'P0001', detail = 'record-changed'` (raise_exception, not
-- retried by PostgREST). The message text is unchanged. DETAIL is the
-- contract the client reads (`src/lib/change-log/store.ts`). Everything
-- else — the `no_data_found` branch, the row lock, the transitions append —
-- is 0011's body verbatim.
--
-- Down (manual): re-run 0011's `create or replace function
--   public.advance_change_log_record`.

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

commit;
