-- ─── Accepting a make-page proposal records the made page's id (KAN-179) ────
--
-- Why: `recordPageProposal` (src/lib/pages/make-page.ts) writes a `create_page`
-- record with `target_page_id: null` and an `after` carrying no page id — the
-- page doesn't exist yet when the proposal is written, only once "make page"
-- actually creates it. Undoing a made page needs to know WHICH page to trash,
-- so accepting that record must stamp the page's id onto it in the same
-- transaction the status advances in: two round-trips could leave an accepted
-- record with no page id recorded, or a page id recorded against a record that
-- never actually reached `accepted`.
--
-- What changed: `accept_create_page_record`, parallel to `accept_change_log_record`
-- (0011) but narrower — it never touches `public.pages` itself (the caller
-- already created the page; this only commits the record), and its refusal on
-- an already-settled record reuses `advance_change_log_record`'s own CAS
-- pattern (errcode P0001, detail 'record-changed' — not the retryable
-- serialization_failure 0024/0025 already moved everything else off of).
--
-- `change_log_append_only` (0011) raises on exactly this write today: its FK
-- guard admits `target_page_id` going to NULL only (the ON DELETE SET NULL
-- case), and its content guard admits `after` being redacted to NULL only —
-- neither anticipated a column being filled in AFTER insert. So this migration
-- also re-creates that trigger function from 0020's body verbatim (the latest
-- at time of writing — 0020 replaced 0011's `workspace` comparison with
-- `pond_id`), adding ONE narrow exception to each of those two checks: a
-- `create_page` record whose `target_page_id` is still null may have it set,
-- exactly once, together with `after` gaining exactly
-- `{..., pageId: <that same id>}` and nothing else —
-- the precise shape `accept_create_page_record` writes above, checked value-
-- for-value, not just "an action name waives the rule". Every other guard in
-- the function (identity, links, source_thread_id, before, read, the
-- transitions audit, status_at) is untouched.
--
-- Down (manual): drop function if exists public.accept_create_page_record(uuid, uuid, text);
--   re-run 0020's `create or replace function public.change_log_append_only`.

begin;

create or replace function public.change_log_append_only()
returns trigger
-- SECURITY DEFINER so the account test below is authoritative: an ordinary
-- `authenticated` caller has no SELECT on `auth.users`, and a check that cannot
-- read its own source of truth is not a check. search_path is pinned because a
-- definer function must never resolve names through the caller's path.
language plpgsql
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
  -- SET NULL — the record outlives the page/thread it pointed at. The ONE
  -- further exception: a `create_page` record's own still-null target_page_id
  -- may be filled in once, on accept (KAN-179) — never re-pointed afterward,
  -- since the exception only admits leaving null, not leaving some other id.
  if new.target_page_id is distinct from old.target_page_id
     and new.target_page_id is not null
     and not (old.action = 'create_page' and old.target_page_id is null)
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
  -- `after` is frozen the same way, with the same one exception as
  -- target_page_id above, checked value-for-value: a `create_page` record's
  -- `after` may gain exactly `old.after || {pageId: new.target_page_id}` in the
  -- same statement that fills in target_page_id — nothing else counts as a
  -- "redaction", and a mismatched merge still raises.
  if new."after" is distinct from old."after"
     and new."after" is not null
     and not (
       old.action = 'create_page'
       and old.target_page_id is null
       and new.target_page_id is not null
       and new."after" = coalesce(old."after", '{}'::jsonb)
         || jsonb_build_object('pageId', new.target_page_id)
     )
  then
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

create or replace function public.accept_create_page_record(
  p_record_id uuid,
  p_page_id uuid,
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
    raise exception
      'change_log record % is no longer proposed, it is % — expected status changed underneath this accept',
      p_record_id, v_record.status
      using errcode = 'P0001', detail = 'record-changed';
  end if;

  update public.change_log
  set status = 'accepted',
      status_at = v_now,
      target_page_id = p_page_id,
      "after" = coalesce("after", '{}'::jsonb) || jsonb_build_object('pageId', p_page_id),
      transitions = transitions
        || jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor))
  where id = p_record_id
  returning * into v_record;

  return v_record;
end;
$$;

grant execute on function public.accept_create_page_record(uuid, uuid, text) to authenticated;

commit;

-- ─── Part b: `change_log_undo_kind` learns `create_page` (KAN-179) ──────────
--
-- Why: 0021 raises `0A000 not-undoable` for any action `change_log_undo_kind`
-- doesn't classify — `create_page` fell into that default because, at 0021's
-- time, a make-page record carried no page id to undo (part a above fixes
-- that). Classifying it as `page` here is the one step this migration owns;
-- `change_log_set_back` still carries no `page` branch, so a `create_page`
-- record is still refused `not-undoable` for now — through the generic
-- "carries no record to set back" fallback (0028) rather than this function's
-- own null-kind check, same code, same detail. The `page` branch that actually
-- trashes the made page is the next ticket step, not this one.
--
-- Re-created from 0023's body verbatim (the latest at time of writing — 0021
-- predates the `glyph`/`area_role` cases 0023 added), adding only the
-- `create_page` arm.
--
-- Down (manual): re-run 0023's `create or replace function
--   private.change_log_undo_kind` to drop the `create_page` arm.

begin;

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
    when 'revert' then 'blocks'
    when 'add_row' then 'row'
    when 'edit_row' then 'row'
    when 'edit_glyph' then 'glyph'
    when 'edit_area_role' then 'area_role'
    when 'create_page' then 'page'
  end;
end;
$$;

commit;

-- ─── Part c: `change_log_set_back` learns the `page` kind (KAN-179) ────────
--
-- Why: part b classified `create_page` as `page`, but `change_log_set_back`
-- still fell through to the generic "carries no record to set back" refusal
-- (0028) for it, since a make-page record's `after` is not a RowSnapshot.
-- This is the step that actually trashes a made page on undo.
--
-- What changed: a `page` branch on `change_log_set_back`, positioned the
-- same way `blocks`/`glyph`/`area_role` are — before the generic row
-- fallback. `change_log_step` (0021) calls this with `p_from :=
-- v_record.after`, `p_to := v_record.before` on undo (not p_redo): a
-- `create_page` record's `before` is always null (the page did not exist
-- yet), so `p_to is null` is exactly "this is an undo of a make-page",
-- carrying the made page's id at `p_record.target_page_id` (part a stamped
-- it there on accept). On redo, `p_from := v_record.before` is null instead,
-- which is the signal this branch raises `not-undoable` on — restoring a
-- trashed subtree under RLS (0027 hides a trashed row even from its own
-- owner) needs a SECURITY DEFINER helper to see trashed descendants, the way
-- 0028's `page_has_any_child` sees them for the `row` kind's own check; that
-- is real scope, not a thin step, and nothing in this ticket's acceptance
-- criteria exercises redo. Flagged for the next ticket under KAN-80.
--
-- The trashing itself calls `public.trash_page` (0027) directly — KAN-97's
-- own trash path, the same RPC the rail's delete uses, not a second
-- hand-rolled walk. That gets the undo the rest of the way for free:
-- `trash_page` writes the `delete` change-log record with the TrashSnapshot
-- `deleted-view.ts` and `restore_page` both read, so the made page shows in
-- trash and can be restored, exactly like any other deleted page.
-- `trash_page` is itself SECURITY DEFINER, scoped by `auth.uid()` — not by
-- trusting `p_record.user_id`, which this branch never passes it — and
-- already refuses a page that is gone or already in trash with
-- `no_data_found`/`not-found`; that refusal is caught here and re-raised as
-- this function's own `page-gone` convention (the same detail every branch
-- above uses for "the page it changed is gone") rather than letting
-- `trash_page`'s wording leak through a layer it doesn't belong to.
--
-- A double undo of the same record never reaches this branch at all:
-- `change_log_step`'s own status check ("only an accepted record can be
-- undone", detail `already-undone`) catches the record's second-time status
-- of `undone` before `change_log_set_back` is ever called.
--
-- Re-created from 0028's body verbatim (the latest at time of writing — 0028
-- is itself a re-creation of 0024's body with the `page_has_any_child` call
-- added), adding only the `page` branch.
--
-- Down (manual): re-run 0028's `create or replace function
--   private.change_log_set_back` to drop the `page` branch.

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

  if p_kind = 'page' then
    if p_from is null then
      -- Redo: restoring a trashed subtree under RLS needs a SECURITY DEFINER
      -- helper to see trashed descendants (the way 0028's page_has_any_child
      -- does for the row kind) — out of this ticket's acceptance criteria.
      raise exception 'change_log record %: redo of a made page is not supported yet', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    begin
      perform public.trash_page(p_record.target_page_id);
    exception
      when no_data_found then
        raise exception 'change_log record %: the page it made is gone', p_record.id
          using errcode = 'no_data_found', detail = 'page-gone';
    end;
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
       or private.page_has_any_child(v_row_id)
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
