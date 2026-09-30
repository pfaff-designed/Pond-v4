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
--     DELETE, and RLS grants select/insert/update but deliberately has NO delete
--     policy, so an ordinary client cannot even attempt one. The single
--     exemption is the account itself going away: a record dies only WITH its
--     pond, via the `user_id` cascade (see the trigger body).
--   * `before` / `after` are never REWRITTEN. The trigger admits exactly one
--     content mutation — redaction to NULL — which is the design's memory-note
--     rule: "deleting a note removes its content from the log (the record keeps
--     only 'a note was deleted, by whom')". Content may go to NULL; it may never
--     become different non-null content.
--   * `transitions` is an append-only audit array — it may only grow.
--   * What advances is `status` (+ `status_at` + one appended transition).
--     Revert, revise, undo and redo each INSERT A NEW record that links back via
--     `links`; history is never mutated in place.
--
-- Per-pond scope is (`user_id`, `workspace`), mirroring 0005 — a record in one
-- workspace is never visible from the other.
--
-- Down (manual, if ever needed):
--   drop table if exists public.change_log cascade;
--   drop function if exists public.change_log_append_only() cascade;
--   drop function if exists public.accept_change_log_record(uuid, jsonb);

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
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- The ONE exemption: a record dies only WITH its pond. When the account
    -- itself goes, `public.users` cascades here, and by the time this fires the
    -- owning user row is already gone — so this test tells a genuine account
    -- deletion apart from an application delete, which is refused. Without it
    -- the trigger would make users undeletable.
    if exists (select 1 from public.users u where u.id = old.user_id) then
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

  -- The transition audit only grows.
  if jsonb_typeof(new.transitions) <> 'array' then
    raise exception 'change_log.transitions must be a json array (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;
  if jsonb_array_length(new.transitions) < jsonb_array_length(old.transitions) then
    raise exception 'change_log is append-only: transitions may only grow (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists change_log_append_only_trg on public.change_log;
create trigger change_log_append_only_trg
  before update or delete on public.change_log
  for each row execute procedure public.change_log_append_only();

-- ── Row-level security ───────────────────────────────────────────────────────
--
-- Granular on purpose: select / insert / update only, no DELETE policy at all.
-- The absent policy is the first "only grows" gate; the trigger above is the
-- second (it also binds the table owner and service role, which bypass RLS).

alter table public.change_log enable row level security;

create policy "change_log: read own rows" on public.change_log
  for select using (auth.uid() = user_id);

create policy "change_log: append own rows" on public.change_log
  for insert with check (auth.uid() = user_id);

create policy "change_log: advance own rows" on public.change_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
