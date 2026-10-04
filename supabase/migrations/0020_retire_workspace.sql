-- ─── Retire `workspace`: the sandbox is a pond (#312, #315) ─────────────────
--
-- `workspace` was a main/sandbox DEV TOGGLE (0005), never tenancy. #315 ruled the
-- sandbox becomes a pond, and 0018's backfill made that true: the `sandbox` pond
-- holds exactly the `workspace='sandbox'` rows. Since then the column has been
-- dead weight — and worse than dead, because two scopes disagreeing is what made
-- `/workspace?pond=<sandbox pond>` return nothing, and what let a page created at
-- `/sandbox` show up in `life`'s rail where `reset_sandbox` would delete it.
--
-- The app no longer reads or writes it: the `/sandbox` route, `SandboxBanner`,
-- `src/lib/sandbox/reset.ts` and `SANDBOX_FIXTURE` are deleted, and every query
-- scopes by `pond_id`.
--
-- TWO FUNCTION BODIES ARE REPLACED, and this is the careful part. Both reference
-- `workspace`, so dropping the column would break them at CALL time, not here:
--
--   * `change_log_append_only()` (0011) freezes `workspace` in its identity list.
--   * `accept_revert_record()` (0014) guards that a revert and its original share
--     a workspace.
--
-- Each body below was extracted VERBATIM from the migration that last defined it
-- and has exactly ONE line changed — the `workspace` comparison becomes a
-- `pond_id` comparison. Nothing else moved. Restating a 172-line trigger from
-- memory is how the FK clearing rules, the before/after redaction limits, the
-- `transitions` tail-only check and the `status_at` guard get silently dropped.
--
-- That substitution also closes a hole the review found: `pond_id` was NOT in the
-- frozen list, so a client holding the JWT could `PATCH` a change-log record into
-- another pond — passing RLS and the trigger, breaking both "the log only grows"
-- and `s6m5`. It is frozen now.
--
-- Down (manual, if ever needed): re-add the column as nullable with its CHECK and
-- indexes, backfill from each row's pond name, then restore 0011's and 0014's
-- bodies verbatim. The sandbox ROUTE is not recoverable from here — it is deleted
-- in the application, by decision, not by this migration.

begin;

-- ─── 1. The two function bodies, with their one changed line ────────────────
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
     or new.pond_id is distinct from old.pond_id
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
      -- The column CHECK constrains `status`; nothing constrained the same value
      -- inside the audit, so the history could name a status the table itself
      -- would reject.
      if (new.transitions -> v_i) ->> 'status' not in (
        'proposed','accepted','rejected','changes_requested',
        'outdated','withdrawn','undone','reverted'
      ) then
        raise exception
          'change_log.transitions entry % names a status that is not one of the eight (id=%)',
          v_i, old.id
          using errcode = 'restrict_violation';
      end if;
    end loop;
  end if;

  -- The audit must agree with the record. Freezing the entries was only half of
  -- it: a raw update could still rewind `accepted` to `proposed` and append
  -- nothing, leaving the log saying one thing and its own history another — P3's
  -- forgery reached from the other side. So a status change appends exactly one
  -- entry, naming the status it lands on; and a record that did not move gains
  -- no entry.
  if new.status is distinct from old.status then
    if jsonb_array_length(new.transitions) <> jsonb_array_length(old.transitions) + 1 then
      raise exception
        'change_log: a status change must append exactly one transition (id=%)', old.id
        using errcode = 'restrict_violation';
    end if;
    if (new.transitions -> -1) ->> 'status' is distinct from new.status then
      raise exception
        'change_log: the appended transition must name the status it lands on (id=%, status=%)',
        old.id, new.status
        using errcode = 'restrict_violation';
    end if;
  elsif new.transitions is distinct from old.transitions then
    raise exception
      'change_log: a transition without a status change is not an advance (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  -- `status_at` records when the record last moved; moving it backwards would
  -- misdate the advance the audit just recorded.
  if new.status_at < old.status_at then
    raise exception 'change_log: status_at may not be rewound (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

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
  if v_original.user_id <> v_revert.user_id or v_original.pond_id <> v_revert.pond_id then
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

-- ─── 2. The seed and reset RPCs go ─────────────────────────────────────────
-- `seed_default_pages` filled five top-level pages whenever the page tree came
-- back empty — which a NEW POND is, so it fought #320's one-row-at-birth rule and
-- collided with `life`'s page names. The effect that called it is already gone.
-- `reset_sandbox` hard-deleted every `workspace='sandbox'` row, which after 0018
-- could include a page the person saw in `life`.
drop function if exists public.reset_sandbox(uuid);
drop function if exists public.seed_sandbox_pages(uuid);
drop function if exists public.seed_default_pages(uuid);

-- ─── 3. The column and its indexes ─────────────────────────────────────────
--
-- `drop column` CASCADES to every index that uses it. SIX indexes name
-- `workspace`, and three of them carry guarantees that would have vanished
-- without a word:
--
--   templates_name_uniq        (0016) template-name uniqueness
--   change_log_pond_recent_idx (0011) the newest-first `all` view
--   change_log_pond_status_idx (0011) the `proposed` view + "N waiting on you"
--
-- Each is re-keyed on `pond_id` BEFORE the column goes — which is what they always
-- meant: 0016's own comment calls a pond "user + workspace". The remaining three
-- are `pages_workspace_idx` and `conversations_workspace_idx` (which exist only to
-- serve the column and are dropped below) and `pages_sibling_title_uniq`, which
-- 0019 already replaced with its pond-keyed equivalent.

drop index if exists public.templates_name_uniq;
create unique index if not exists templates_name_uniq
  on public.templates (pond_id, lower(btrim(name)));

drop index if exists public.change_log_pond_recent_idx;
create index if not exists change_log_pond_recent_idx
  on public.change_log (user_id, pond_id, created_at desc);

drop index if exists public.change_log_pond_status_idx;
create index if not exists change_log_pond_status_idx
  on public.change_log (user_id, pond_id, status);

drop index if exists public.pages_workspace_idx;
drop index if exists public.conversations_workspace_idx;

alter table public.pages         drop column if exists workspace;
alter table public.conversations drop column if exists workspace;
alter table public.change_log    drop column if exists workspace;
alter table public.templates     drop column if exists workspace;

commit;
