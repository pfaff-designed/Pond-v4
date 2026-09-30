-- ─── Durable change log (issue #102, spec #110 — direction LOCKED = Option A) ──
--
-- Design law (`wayfinder/design_handoff_pond/Pond 03 Concepts.dc.html`, data
-- model draft 3): "change log — A database in every pond holding one record for
-- each action taken, by you or by Pond. Each record is a diff with its before
-- and after state and its status: proposed, accepted, rejected, changes
-- requested, outdated, withdrawn, undone or reverted."
--
-- Before this migration the only diff-adjacent storage was the ephemeral
-- `{messages, resolutions}` envelope in `conversations.transcript`: it kept a
-- binary accepted|rejected DECISION per tool call and never persisted the diff
-- itself. This table is the durable, per-pond, only-grows replacement; the
-- envelope is demoted to a session-scoped UI cache (it is NOT removed, so
-- rollback = drop this table and the app degrades to today's behaviour).
--
-- THE CONTRACT — the log only grows:
--   * No record is ever deleted. The `change_log_append_only` trigger raises on
--     DELETE, a second trigger raises on TRUNCATE (which fires no row triggers at
--     all), and RLS grants select/insert/update with deliberately NO delete
--     policy, so an ordinary client cannot even attempt one. The single exemption
--     is the ACCOUNT going away — `auth.users`, not the `public.users` mirror
--     (see the trigger body for why that distinction is the whole ballgame).
--   * `before`, `after` and `read` are never REWRITTEN. The trigger admits
--     exactly one content mutation — redaction to NULL — which is the design's
--     memory-note rule: "deleting a note removes its content from the log (the
--     record keeps only 'a note was deleted, by whom')". Content may go to NULL;
--     it may never become different non-null content.
--   * `transitions` is an append-only audit array — existing entries come back
--     byte-identical and only the TAIL may grow. A length check alone let a
--     same-length array forge the history in place.
--   * `links` are stamped at INSERT and frozen: revert, revise, undo and redo
--     each INSERT A NEW record carrying its own links rather than re-pointing an
--     existing one.
--   * What advances is `status` (+ `status_at` + one appended transition), and
--     the advance goes through `advance_change_log_record`, which appends in SQL
--     on a locked row under a compare-and-swap. History is never mutated in
--     place; a concurrent advance is a loud conflict, not a lost entry.
--
-- Per-pond scope is (`user_id`, `workspace`), mirroring 0005 — a record in one
-- workspace is never visible from the other.
--
-- Down (manual, if ever needed):
--   drop table if exists public.change_log cascade;
--   drop function if exists public.change_log_append_only() cascade;
--   drop function if exists public.change_log_no_truncate() cascade;
--   drop function if exists public.accept_change_log_record(uuid, jsonb, text);
--   drop function if exists public.advance_change_log_record(uuid, text, text, text);

begin;

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,

  -- Per-pond scope. Mirrors 0005's discriminator on pages/conversations.
  workspace text not null default 'main'
    check (workspace in ('main', 'sandbox')),

  -- THE EIGHT. Constrained here so a ninth status is a migration, not a typo.
  -- (`changes_requested` is the snake_case spelling of the design's "changes
  -- requested".)
  status text not null
    check (status in (
      'proposed',
      'accepted',
      'rejected',
      'changes_requested',
      'outdated',
      'withdrawn',
      'undone',
      'reverted'
    )),

  -- What produced the record: edit, create_page, delete, move, memory_note,
  -- define_schema, add_row, promote_table, configure_view, link_records, revert,
  -- undo, redo. Deliberately NOT a CHECK — the spec calls this list extensible,
  -- and a new tool should not need a migration to be logged.
  action text not null,

  -- 'you' | 'pond' today; forward-compatible with a sharer's identity.
  actor text not null default 'you',

  -- Where it applies. Nullable for pond-level records. ON DELETE SET NULL (not
  -- CASCADE) because the design keeps deletion records after the page is gone:
  -- "the record keeps the name + when it went even after the trash empties".
  target_page_id uuid references public.pages(id) on delete set null,
  target_block_id text,

  -- The diff itself: full snapshots, re-renderable through the module registry
  -- facets (serialize / preview) without the originating tool call.
  "before" jsonb,
  "after" jsonb,

  -- Provenance: the thread it came from, the tool call inside it, and the read
  -- chips (what Pond read before proposing).
  source_thread_id uuid references public.conversations(id) on delete set null,
  tool_call_id text,
  "read" jsonb,

  -- Related records: { revert_of, revised_from, undo_of, redo_of } → record ids.
  links jsonb not null default '{}'::jsonb,

  -- Append-only audit of every status this record has held:
  -- [{ status, at, actor }, …], oldest first.
  transitions jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  status_at timestamptz not null default now()
);

-- ── Indexes (the three the spec names) ───────────────────────────────────────

-- Newest-first listing of a pond's log (the default `all` view).
create index if not exists change_log_pond_recent_idx
  on public.change_log (user_id, workspace, created_at desc);

-- The `proposed` view + the "N proposed, waiting on you" figure.
create index if not exists change_log_pond_status_idx
  on public.change_log (user_id, workspace, status);

-- The `by page` view, and the outdated sweep when a page is committed.
create index if not exists change_log_target_page_idx
  on public.change_log (target_page_id);

-- ── Append-only enforcement ──────────────────────────────────────────────────
--
-- Application code goes through src/lib/change-log/store.ts, which owns the
-- status state machine. This trigger is the floor under it: even a hand-written
-- SQL statement cannot delete a record or rewrite a diff.

create or replace function public.change_log_append_only()
returns trigger
language plpgsql
-- SECURITY DEFINER so the account test below is authoritative: an ordinary
-- `authenticated` caller has no SELECT on `auth.users`, and a check that cannot
-- read its own source of truth is not a check. search_path is pinned because a
-- definer function must never resolve names through the caller's path.
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_i integer;
begin
  if tg_op = 'DELETE' then
    -- The ONE exemption: a record dies only WITH its pond — and "the pond" is
    -- the ACCOUNT, `auth.users`, not the `public.users` mirror.
    --
    -- Reading the mirror here was a hole (review of #144, probe P9). `0001`
    -- grants the row owner `for all` on their own mirror row, which includes
    -- DELETE, and change_log cascades off it — so a browser client could wipe
    -- its entire log by deleting a row it was allowed to delete, while the
    -- account itself survived. The mirror is bookkeeping; the account is the
    -- thing whose disappearance may take the log with it.
    --
    -- On a genuine `delete from auth.users`, the RI cascade runs after the
    -- parent row is gone, so this sees no account and lets the record go —
    -- without the exemption the trigger would make accounts undeletable.
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      raise exception 'change_log is append-only: records are never deleted (id=%)', old.id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  -- Identity and provenance are frozen at insert.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.workspace is distinct from old.workspace
     or new.action is distinct from old.action
     or new.actor is distinct from old.actor
     or new.created_at is distinct from old.created_at
     or new.target_block_id is distinct from old.target_block_id
     or new.tool_call_id is distinct from old.tool_call_id
  then
    raise exception 'change_log is append-only: identity columns are immutable (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  -- `links` is frozen too (review of #144, probe P2). The chain tying a revision
  -- to what it revised — and a revert/undo to what it reverted/undid (#103/#104)
  -- — is stamped at INSERT and never re-pointed: each of those operations
  -- inserts a NEW record carrying its own links. Adding a BACKlink to an
  -- existing record later would be a deliberate migration, not an update.
  if new.links is distinct from old.links then
    raise exception 'change_log is append-only: links are immutable (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  -- The two FK columns may only be cleared, and only by the FK's own ON DELETE
  -- SET NULL — the record outlives the page/thread it pointed at.
  if new.target_page_id is distinct from old.target_page_id
     and new.target_page_id is not null
  then
    raise exception 'change_log is append-only: target_page_id may only be cleared (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.source_thread_id is distinct from old.source_thread_id
     and new.source_thread_id is not null
  then
    raise exception 'change_log is append-only: source_thread_id may only be cleared (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  -- Diff content is never rewritten. The ONE permitted mutation is redaction to
  -- NULL (the memory-note delete rule) — content can be erased, never replaced.
  if new."before" is distinct from old."before" and new."before" is not null then
    raise exception 'change_log is append-only: before may only be redacted to null (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;
  if new."after" is distinct from old."after" and new."after" is not null then
    raise exception 'change_log is append-only: after may only be redacted to null (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;
  -- `read` is the read-chip provenance of #110 criterion 1 — what Pond consulted
  -- before it proposed. It was unfrozen (review of #144, probe P1), so the record
  -- could be made to claim Pond read something it never opened. It follows the
  -- same rule as the diff content: redactable with the note, never rewritten.
  if new."read" is distinct from old."read" and new."read" is not null then
    raise exception 'change_log is append-only: read may only be redacted to null (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  -- The transition audit only grows, and only at the TAIL.
  --
  -- A length guard alone is not append-only (review of #144, probes P3/P4): a
  -- same-length array replaced the whole history in place, so provenance could
  -- be forged silently, and an array of scalars passed because only the OUTER
  -- type was checked. Every entry that already exists is history — it must come
  -- back byte-identical — and anything appended must actually be a transition.
  if jsonb_typeof(new.transitions) <> 'array' then
    raise exception 'change_log.transitions must be a json array (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.transitions is distinct from old.transitions then
    if jsonb_array_length(new.transitions) < jsonb_array_length(old.transitions) then
      raise exception 'change_log is append-only: transitions may only grow (id=%)', old.id
        using errcode = 'restrict_violation';
    end if;
    for v_i in 0 .. jsonb_array_length(old.transitions) - 1 loop
      if new.transitions -> v_i is distinct from old.transitions -> v_i then
        raise exception
          'change_log is append-only: transitions entry % may not be rewritten (id=%)', v_i, old.id
          using errcode = 'restrict_violation';
      end if;
    end loop;
    for v_i in jsonb_array_length(old.transitions) .. jsonb_array_length(new.transitions) - 1 loop
      if jsonb_typeof(new.transitions -> v_i) <> 'object'
         or (new.transitions -> v_i) ->> 'status' is null
      then
        raise exception
          'change_log.transitions entry % must be an object carrying a status (id=%)', v_i, old.id
          using errcode = 'restrict_violation';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists change_log_append_only_trg on public.change_log;
create trigger change_log_append_only_trg
  before update or delete on public.change_log
  for each row execute procedure public.change_log_append_only();

-- TRUNCATE fires no ROW triggers at all, so the whole log could be emptied in one
-- statement while every row-level guarantee above held (review of #144, probe
-- P8). It takes owner rights — but this file claims the log can never be
-- emptied, and a claim with a hole in it is worse than no claim. There is no
-- legitimate truncate of a change log: even dropping a pond goes through the
-- account cascade, which is a DELETE.

create or replace function public.change_log_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'change_log is append-only: the log is never truncated'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists change_log_no_truncate_trg on public.change_log;
create trigger change_log_no_truncate_trg
  before truncate on public.change_log
  for each statement execute procedure public.change_log_no_truncate();

-- ── Row-level security ───────────────────────────────────────────────────────
--
-- Granular on purpose: select / insert / update only, no DELETE policy at all.
-- The absent policy is the first "only grows" gate; the trigger above is the
-- second (it also binds the table owner and service role, which bypass RLS).

alter table public.change_log enable row level security;

-- `create policy` has no IF NOT EXISTS, and these sit inside begin;…commit; — so
-- without the drops a replay of this migration aborted the whole transaction on a
-- duplicate-object error instead of doing nothing. Every other statement in this
-- file is already guarded; these were the exception.
drop policy if exists "change_log: read own rows" on public.change_log;
create policy "change_log: read own rows" on public.change_log
  for select using (auth.uid() = user_id);

drop policy if exists "change_log: append own rows" on public.change_log;
create policy "change_log: append own rows" on public.change_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "change_log: advance own rows" on public.change_log;
create policy "change_log: advance own rows" on public.change_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Atomic advance ───────────────────────────────────────────────────────────
--
-- Advancing a status is read-modify-write on `transitions`, and doing that from
-- the application meant reading the array, appending in JS, and writing the whole
-- thing back. Two advances racing both read one entry and both wrote two, so the
-- second ERASED the first's entry — a lost update in the one table whose whole
-- promise is that it only grows. (The append-only trigger now catches the
-- overwrite, but a caller should get a clear conflict, not a constraint error.)
--
-- So the append happens in SQL, on a locked row, guarded by a compare-and-swap:
-- the caller states the status it believes it is advancing FROM, and a record
-- that moved underneath it raises instead of clobbering.
--
-- LEGALITY of a transition is NOT decided here — `src/lib/change-log/status.ts`
-- owns the state machine (spec #110 §3 puts it in the write layer), and
-- duplicating the table in SQL would only let the two drift. This function owns
-- atomicity; the store owns what may follow what.

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
      using errcode = 'serialization_failure';
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

grant execute on function public.advance_change_log_record(uuid, text, text, text) to authenticated;

-- ── Atomic accept ────────────────────────────────────────────────────────────
--
-- Accepting a proposal must commit the page change AND advance the record in one
-- transaction — never an accepted record without the committed block, never a
-- committed block without the record (spec #110 acceptance criterion 3). Two
-- PostgREST round-trips cannot give that, so the pair lives in one function.
--
-- Returns the advanced record. Raises if the record is missing, is not owned by
-- the page's owner, or is not `proposed` (an outdated/rejected/already-accepted
-- record has no accept affordance) — and the page write rolls back with it.

create or replace function public.accept_change_log_record(
  p_record_id uuid,
  p_blocks jsonb,
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
  if v_record.status <> 'proposed' then
    raise exception 'change_log record % is %, only a proposed record can be accepted',
      p_record_id, v_record.status
      using errcode = 'invalid_parameter_value';
  end if;
  if v_record.target_page_id is null then
    raise exception 'change_log record % has no target page to commit to', p_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  update public.pages
  set blocks = p_blocks, updated_at = v_now
  where id = v_record.target_page_id and user_id = v_record.user_id;
  if not found then
    raise exception 'target page % of change_log record % no longer exists',
      v_record.target_page_id, p_record_id
      using errcode = 'no_data_found';
  end if;

  update public.change_log
  set status = 'accepted',
      status_at = v_now,
      transitions = transitions
        || jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor))
  where id = p_record_id
  returning * into v_record;

  return v_record;
end;
$$;

grant execute on function public.accept_change_log_record(uuid, jsonb, text) to authenticated;

commit;
