-- ─── Moving a page is one atomic write, and it is logged (KAN-466 part 1) ───
--
-- Why: `movePage` (src/lib/pages/client.ts) today writes the new `parent_id`
-- in one round trip, then reindexes every sibling in a second, unrelated
-- `Promise.all` of per-row UPDATEs — two statements, no transaction between
-- them, and nothing logged. A failure between the two (a dropped connection,
-- a thrown error on sibling 3 of 5) leaves the page re-parented under the
-- new parent but still carrying its OLD order — interleaved with whichever
-- siblings' UPDATEs landed before the failure. This migration replaces both
-- writes with one RPC that does the reparent, the dense reindex of the
-- destination sibling group, and the `move` change_log record in a single
-- PL/pgSQL function body — one statement from the caller's side, so a raise
-- anywhere in it rolls back everything the call had done so far.
--
-- SECURITY. `apply_page_move` is `security definer`, like `trash_page`/
-- `restore_page` (0027) — NOT like `change_log_step`/`change_log_set_back`
-- (0021), which never write `auth.uid()` into their own SQL text at all and
-- lean on the `pages`/`change_log` RLS policies instead. Those policies were
-- parsed once, at `create policy` time, under the migration's owner role, so
-- their stored plan never re-resolves `auth.*` names. A PL/pgSQL function's
-- own embedded SQL is different: each statement is parsed on first use PER
-- SESSION, under whoever is CALLING the function — so an invoker-mode
-- function that writes `auth.uid()` explicitly needs the caller to hold
-- USAGE on schema `auth`, which `authenticated` never has (confirmed against
-- a real Postgres: the identical statement run invoker-mode raises `42501
-- permission denied for schema auth`, run definer-mode it does not). `security
-- definer` makes the parse happen as the function owner instead, same as
-- `trash_page` already relies on.
--
-- Ownership is still checked explicitly, the same way `trash_page` checks it:
-- the lookup itself is scoped to `user_id = auth.uid()`, so another user's
-- page and a page that does not exist raise the identical `not-found` —
-- nothing here lets a non-owner learn which is true.
--
-- `p_sibling_order` is the FULL dense order of the destination group, the
-- moved page included — the caller's computed array, the same shape
-- `movePage`'s own `siblingOrder` input already is. Reindexing walks it and
-- writes `"order" = <its index>`, scoped to `user_id = v_page.user_id` per
-- row — a stranger's id slipped into the array touches 0 rows, same as any
-- other RLS-scoped UPDATE, not a privilege hole.
--
-- The `p_page_id` ∈ `p_sibling_order` check sits AFTER the `parent_id` UPDATE
-- on purpose: that UPDATE is the "mid-write" a bad `p_sibling_order` must not
-- leave half-applied, and it is the pglite test's own proof — an uncaught
-- `raise` aborts the whole calling statement, so the reparent it already did
-- unwinds with it, exactly as a genuine failure between the reparent and the
-- reindex would need to.
--
-- `MoveSnapshot` (src/lib/change-log/types.ts) is `before`/`after` alike:
-- the group's parent id, its title resolved now (not a live join — a later
-- rename or trash of that parent must not change what this record reads,
-- the same reasoning `TrashSnapshot.parentPath` already carries), and the
-- group's full sibling order. `private.page_move_parent_title` resolves a
-- null parent to the pond's home page title, `type = 'home' and parent_id is
-- null` (0026's own test for the pond root) — the Rail's toast reads "moved
-- roof to <that title>" when roof lands at the top level.
--
-- HARDENING (KAN-466 fix). `apply_page_move` is `security definer`, so it
-- bypasses `"pages: update own live rows"` (0027) entirely rather than
-- inheriting its checks — the function's own WHERE clauses have to stand in
-- for that policy's `deleted_at is null` and ownership guards, every place a
-- row it touches isn't already pinned down by the initial `v_page` lookup.
-- Three gaps, fixed inline rather than in a new function: (1) the moved-page
-- lookup and the destination reindex both now require `deleted_at is null`,
-- so a trashed page can be neither moved nor reindexed as someone else's
-- live sibling. (2) `p_new_parent_id`, when given, must be a live page this
-- caller owns in the SAME pond, and not the moved page or any page in its
-- own subtree — otherwise a drag could hide a page (and its whole subtree)
-- from every rail by parenting it to its own child, or reparent it across
-- ponds. (3) `change_log_set_back`'s `move` branch (below) now refuses
-- `page-gone` when the parent it would restore (or re-apply, on redo) to is
-- itself trashed or gone, rather than letting that UPDATE's dangling
-- `parent_id` surface as a raw `23503` foreign-key violation.
--
-- Down (manual):
--   revoke execute on function public.move_page(uuid, uuid, uuid[]) from authenticated;
--   drop function if exists public.move_page(uuid, uuid, uuid[]);
--   drop function if exists private.apply_page_move(uuid, uuid, uuid[], text);
--   drop function if exists private.page_move_parent_title(uuid, uuid, uuid);

begin;

create or replace function private.page_move_parent_title(
  p_parent_id uuid,
  p_pond_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then (
      select title from public.pages
       where pond_id is not distinct from p_pond_id
         and user_id = p_user_id
         and type = 'home'
         and parent_id is null
       limit 1
    )
    else (
      select title from public.pages
       where id = p_parent_id and user_id = p_user_id
    )
  end
$$;

revoke all on function private.page_move_parent_title(uuid, uuid, uuid) from public;
grant execute on function private.page_move_parent_title(uuid, uuid, uuid) to authenticated;

create or replace function private.apply_page_move(
  p_page_id uuid,
  p_new_parent_id uuid,
  p_sibling_order uuid[],
  p_actor text default 'you'
)
returns public.change_log
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page public.pages;
  v_old_parent_id uuid;
  v_old_parent_title text;
  v_old_sibling_order uuid[];
  v_new_parent_title text;
  v_now timestamptz := now();
  v_record public.change_log;
  v_id uuid;
  v_idx integer := 0;
begin
  select * into v_page from public.pages
    where id = p_page_id and user_id = auth.uid() and deleted_at is null
    for update;
  if not found then
    raise exception 'page % not found', p_page_id
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  -- The destination must be a live page this caller owns, in the same pond —
  -- a trashed, cross-pond or someone-else's page is "not found" to a mover,
  -- the same way v_page's own lookup above treats those. Checked separately
  -- from a cycle (below) so each raises the refusal that actually fits it.
  if p_new_parent_id is not null and not exists (
    select 1 from public.pages
     where id = p_new_parent_id
       and user_id = auth.uid()
       and pond_id is not distinct from v_page.pond_id
       and deleted_at is null
  ) then
    raise exception 'page % not found', p_new_parent_id
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  -- A page cannot become its own parent, or move under one of its own
  -- descendants (that would hide it from every rail along with the whole
  -- subtree underneath). The subtree walk's base case (`id = p_page_id`)
  -- catches the first; the recursive step catches the second.
  if p_new_parent_id is not null and exists (
    with recursive subtree as (
      select id from public.pages where id = p_page_id
      union all
      select p.id from public.pages p
        join subtree s on p.parent_id = s.id
       where p.user_id = v_page.user_id
    )
    select 1 from subtree where id = p_new_parent_id
  ) then
    raise exception 'page % is a descendant of %, and cannot become its parent', p_new_parent_id, p_page_id
      using errcode = 'invalid_parameter_value', detail = 'invalid-new-parent';
  end if;

  v_old_parent_id := v_page.parent_id;

  select array_agg(id order by "order", lower(title))
    into v_old_sibling_order
    from public.pages
   where user_id = v_page.user_id
     and pond_id is not distinct from v_page.pond_id
     and deleted_at is null
     and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_old_parent_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_old_parent_title :=
    private.page_move_parent_title(v_old_parent_id, v_page.pond_id, v_page.user_id);

  update public.pages
     set parent_id = p_new_parent_id, updated_at = v_now
   where id = p_page_id;

  -- The reparent above is the write a malformed sibling order must not leave
  -- half-applied — see the migration header.
  if p_page_id <> all(p_sibling_order) then
    raise exception 'sibling order for page % does not include the page itself', p_page_id
      using errcode = 'invalid_parameter_value', detail = 'invalid-sibling-order';
  end if;

  foreach v_id in array p_sibling_order loop
    update public.pages
       set "order" = v_idx, updated_at = v_now
     where id = v_id and user_id = v_page.user_id and deleted_at is null;
    v_idx := v_idx + 1;
  end loop;

  v_new_parent_title :=
    private.page_move_parent_title(p_new_parent_id, v_page.pond_id, v_page.user_id);

  insert into public.change_log
    (user_id, pond_id, status, action, actor, target_page_id,
     "before", "after", transitions, created_at, status_at)
  values (
    v_page.user_id, v_page.pond_id, 'accepted', 'move', p_actor, p_page_id,
    jsonb_build_object(
      'parentId', v_old_parent_id,
      'parentTitle', v_old_parent_title,
      'siblingOrder', to_jsonb(coalesce(v_old_sibling_order, '{}'::uuid[]))
    ),
    jsonb_build_object(
      'parentId', p_new_parent_id,
      'parentTitle', v_new_parent_title,
      'siblingOrder', to_jsonb(p_sibling_order)
    ),
    jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
    v_now, v_now
  )
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function private.apply_page_move(uuid, uuid, uuid[], text) from public;
grant execute on function private.apply_page_move(uuid, uuid, uuid[], text) to authenticated;

create or replace function public.move_page(
  p_page_id uuid,
  p_new_parent_id uuid,
  p_sibling_order uuid[]
)
returns public.change_log
language sql
set search_path = public, pg_temp
as $$
  select * from private.apply_page_move(p_page_id, p_new_parent_id, p_sibling_order, 'you')
$$;

revoke all on function public.move_page(uuid, uuid, uuid[]) from public;
grant execute on function public.move_page(uuid, uuid, uuid[]) to authenticated;

commit;

-- ─── Part 2a: `change_log_undo_kind` learns `move` (KAN-466) ───────────────
--
-- Why: a `move` record raised `0A000 not-undoable` (0021's unlisted-action
-- default) because `change_log_undo_kind`'s case never named it. Classifying
-- it as its own kind, `move` (not reusing `row` or `blocks` — a move is
-- neither a row's content nor a page's blocks), is the one step this part
-- owns; `change_log_set_back` still carries no `move` branch until part 2b.
--
-- Re-created from 0029's body verbatim, adding only the `move` arm.
--
-- Down (manual): re-run 0029's `create or replace function
--   private.change_log_undo_kind` to drop the `move` arm.

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
    when 'move' then 'move'
  end;
end;
$$;

commit;

-- ─── Part 2b: `change_log_set_back` learns the `move` kind (KAN-466) ───────
--
-- Why: part 2a classified `move` records, but `change_log_set_back` still
-- fell through to the generic "carries no record to set back" refusal
-- (0028's `RowSnapshot`-only fallback) for them, since a `MoveSnapshot` is
-- not a `RowSnapshot`. This is the step that actually puts the page back.
--
-- What changed: a `move` branch, positioned the same way `page`/`area_role`/
-- `glyph` are — before the generic row fallback. The check and the write
-- read exactly like `apply_page_move`'s own body (migration header above):
-- verify the page's CURRENT parent_id still matches `p_from.parentId` (else
-- `P0001`/`page-changed` — someone moved it again since this record was
-- made, same convention `blocks`/`glyph`/`area_role` already use for their
-- own single-field compares), then reparent to `p_to.parentId` and densely
-- reindex `p_to.siblingOrder`. `change_log_step` (0021) calls this with
-- `p_from := v_record.after`, `p_to := v_record.before` on undo (so "current
-- must equal where the move LANDED, restore to where it came FROM") and the
-- two swapped on redo — the same compare-and-reapply shape either way, so
-- this needs no separate undo/redo branch, exactly like `blocks` already has
-- none.
--
-- This duplicates `apply_page_move`'s reparent-then-reindex sequence rather
-- than calling that RPC: `apply_page_move` also inserts its own `move`
-- change_log record, and `change_log_step` already inserts the `undo`/`redo`
-- record for this step — calling it here would write a second, spurious
-- `move` record nobody asked for. Every other kind's branch (`blocks`,
-- `glyph`, `area_role`, `page`) is already self-contained inline rather than
-- delegating to the forward RPC that made the original record, so inlining
-- the write here (instead of extracting a shared helper that would also
-- require editing `apply_page_move`'s already-committed body) matches the
-- existing shape of this function.
--
-- A double undo of the same record never reaches this branch: `change_log_
-- step`'s own status check ("only an accepted record can be undone", detail
-- `already-undone`) catches the record's second-time `undone` status before
-- `change_log_set_back` is ever called — same guarantee the `page` kind's
-- comment (0029) already relies on.
--
-- Re-created from 0029's body verbatim, adding only the `move` branch and its
-- one extra local (`v_idx`, the reindex counter — `apply_page_move` already
-- has one of its own, but this function's existing locals carry none).
--
-- Down (manual): re-run 0029's `create or replace function
--   private.change_log_set_back` to drop the `move` branch.

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
  v_idx integer;
begin
  if p_kind = 'move' then
    if not (
      jsonb_typeof(p_from) = 'object' and jsonb_typeof(p_from -> 'siblingOrder') = 'array'
      and jsonb_typeof(p_to) = 'object' and jsonb_typeof(p_to -> 'siblingOrder') = 'array'
    ) then
      raise exception 'change_log record % carries no move to set back', p_record.id
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    select parent_id into v_parent_id from public.pages
      where id = p_record.target_page_id
        and user_id = p_record.user_id
        and pond_id is not distinct from p_record.pond_id;
    if not found then
      raise exception 'change_log record %: the page it moved is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;

    if v_parent_id is distinct from
       (case when p_from ->> 'parentId' is null then null else (p_from ->> 'parentId')::uuid end)
    then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
    end if;

    -- The parent being restored (or re-applied, on redo) to must still be a
    -- live page this record's own user/pond can reach — a trashed or gone
    -- one would otherwise only surface as a raw 23503 off the UPDATE below.
    if p_to ->> 'parentId' is not null and not exists (
      select 1 from public.pages
       where id = (p_to ->> 'parentId')::uuid
         and user_id = p_record.user_id
         and pond_id is not distinct from p_record.pond_id
         and deleted_at is null
    ) then
      raise exception 'change_log record %: the page it moved to is gone', p_record.id
        using errcode = 'no_data_found', detail = 'page-gone';
    end if;

    update public.pages
       set parent_id =
             case when p_to ->> 'parentId' is null then null else (p_to ->> 'parentId')::uuid end,
           updated_at = now()
     where id = p_record.target_page_id;

    v_idx := 0;
    for v_row_id in select jsonb_array_elements_text(p_to -> 'siblingOrder')::uuid loop
      update public.pages
         set "order" = v_idx, updated_at = now()
       where id = v_row_id and user_id = p_record.user_id;
      v_idx := v_idx + 1;
    end loop;

    return null;
  end if;

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

-- ─── Part 2c: `change_log_step` gets an explicit no-op for `move` (KAN-466) ─
--
-- Why: the `if v_kind = 'blocks' ... else ...` dichotomy (0021) appends
-- `coalesce(v_from ->> 'id', v_to ->> 'id')::uuid` into `v_moved_rows` for
-- ANY kind that is not `'blocks'` — before this ticket that was only ever
-- `row`, `glyph`, `area_role` or `page`, all of which either carry an `id` or
-- (for `glyph`/`area_role`, whose snapshot is a bare string/null) produce a
-- harmless `NULL` append (`= any(array-with-null)` matches nothing). A
-- `MoveSnapshot` has no `id` key either, so it would ALSO fall through
-- harmlessly — but implicitly, not explicitly, and a move is conceptually
-- neither a row-content change nor a blocks change, so it gets its own named
-- branch rather than leaning on that accidental null-safety.
--
-- Re-created from 0021's body verbatim (the only migration that has ever
-- defined this function), adding only the `elsif v_kind = 'move'` branch.
--
-- Down (manual): re-run 0021's `create or replace function
--   private.change_log_step` to drop the `move` branch.

begin;

create or replace function private.change_log_step(
  p_record_ids uuid[],
  p_pond_id uuid,
  p_actor text,
  p_redo boolean
)
returns setof public.change_log
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_missing uuid;
  v_targets uuid[];
  v_rows uuid[];
  v_ids uuid[];
  v_id uuid;
  v_record public.change_log;
  v_undo public.change_log;
  v_made public.change_log;
  v_kind text;
  v_from jsonb;
  v_to jsonb;
  v_position jsonb;
  v_moved_pages uuid[] := '{}';
  v_moved_rows uuid[] := '{}';
  v_at timestamptz;
begin
  if p_record_ids is null or cardinality(p_record_ids) = 0 or p_pond_id is null then
    raise exception 'a step needs its records and the pond they are in'
      using errcode = 'invalid_parameter_value', detail = 'not-found';
  end if;

  select x into v_missing from unnest(p_record_ids) as x
    where not exists (select 1 from public.change_log c where c.id = x)
    limit 1;
  if found then
    raise exception 'change_log record % not found', v_missing
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  -- What a record targets and its before/after are frozen by the append-only
  -- trigger, so they can be read before the locks are taken.
  select array_agg(distinct c.target_page_id) filter (where c.target_page_id is not null)
    into v_targets
    from public.change_log c where c.id = any(p_record_ids);
  select array_agg(distinct private.change_log_row_id(s.snap))
           filter (where private.change_log_row_id(s.snap) is not null)
    into v_rows
    from public.change_log c
    cross join lateral (values (c."before"), (c."after")) as s(snap)
   where c.id = any(p_record_ids);

  perform 1 from public.change_log
    where id = any(p_record_ids)
       or (p_redo
         and links ? 'undo_of'
         and links ->> 'undo_of' = any(p_record_ids::text[])
         and action = 'undo'
         and status = 'accepted')
       or (status = 'proposed'
         and ((action in ('edit', 'revert') and target_page_id = any(v_targets))
           or (action = 'edit_row' and private.change_log_row_id("before") = any(v_rows))))
    order by id
    for update;

  perform 1 from public.pages
    where id = any(v_targets) or id = any(v_rows)
    order by id
    for update;

  with step as (
    select k.id, min(k.ord) as ord
      from unnest(p_record_ids) with ordinality as k(id, ord)
     group by k.id
  )
  select case when p_redo
      then array_agg(c.id order by c.created_at asc, step.ord asc)
      else array_agg(c.id order by c.created_at desc, step.ord desc)
    end
    into v_ids
    from step join public.change_log c on c.id = step.id;

  foreach v_id in array v_ids loop
    select * into v_record from public.change_log where id = v_id;
    if v_record.pond_id is distinct from p_pond_id then
      raise exception 'change_log record % is not in this pond', v_id
        using errcode = 'invalid_parameter_value', detail = 'other-pond';
    end if;
    if not p_redo and v_record.status <> 'accepted' then
      raise exception 'change_log record % is %, only an accepted record can be undone',
        v_id, v_record.status
        using errcode = 'invalid_parameter_value', detail = 'already-undone';
    end if;
    if p_redo and v_record.status <> 'undone' then
      raise exception 'change_log record % is %, only an undone record can be redone',
        v_id, v_record.status
        using errcode = 'invalid_parameter_value', detail = 'not-undone';
    end if;

    v_kind := private.change_log_undo_kind(v_record);
    if v_kind is null then
      raise exception 'change_log record %: a % cannot be undone or redone', v_id, v_record.action
        using errcode = 'feature_not_supported', detail = 'not-undoable';
    end if;

    if p_redo then
      select * into v_undo from public.change_log
        where links ? 'undo_of'
          and links ->> 'undo_of' = v_id::text
          and action = 'undo'
          and status = 'accepted'
          and pond_id is not distinct from v_record.pond_id
        order by created_at desc
        limit 1;
      if not found then
        raise exception 'change_log record % has no standing undo to take back', v_id
          using errcode = 'invalid_parameter_value', detail = 'not-undone';
      end if;
      v_from := v_record."before";
      v_to := v_record."after";
      v_position := v_undo."before" -> 'position';
    else
      v_from := v_record."after";
      v_to := v_record."before";
      v_position := null;
    end if;

    v_position := private.change_log_set_back(v_record, v_kind, v_from, v_to, v_position);

    v_at := clock_timestamp();
    insert into public.change_log
      (user_id, pond_id, status, action, actor, target_page_id, target_block_id,
       "before", "after", links, transitions, created_at, status_at)
    values (
      v_record.user_id, v_record.pond_id, 'accepted',
      case when p_redo then 'redo' else 'undo' end,
      p_actor, v_record.target_page_id, v_record.target_block_id,
      case when v_position is null then v_from
        else v_from || jsonb_build_object('position', v_position) end,
      v_to,
      jsonb_build_object(case when p_redo then 'redo_of' else 'undo_of' end, v_id),
      jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_at, 'actor', p_actor)),
      v_at, v_at
    )
    returning * into v_made;

    update public.change_log
    set status = 'undone',
        status_at = v_at,
        transitions = transitions
          || jsonb_build_array(jsonb_build_object('status', 'undone', 'at', v_at, 'actor', p_actor))
    where id = case when p_redo then v_undo.id else v_id end;

    if v_kind = 'blocks' then
      v_moved_pages := array_append(v_moved_pages, v_record.target_page_id);
    elsif v_kind = 'move' then
      -- A move touches neither a page's blocks nor a row's content, so it
      -- must not fall into the generic row-id-append branch below.
      null;
    else
      v_moved_rows := array_append(v_moved_rows, coalesce(v_from ->> 'id', v_to ->> 'id')::uuid);
    end if;

    return next v_made;
  end loop;

  -- `now()` is when this transaction began; a proposal made since would have its
  -- `status_at` rewound by it.
  v_at := clock_timestamp();
  update public.change_log c
  set status = 'outdated',
      status_at = v_at,
      transitions = c.transitions
        || jsonb_build_array(jsonb_build_object('status', 'outdated', 'at', v_at, 'actor', p_actor))
  where c.status = 'proposed'
    and c.pond_id is not distinct from p_pond_id
    and (
      (c.action in ('edit', 'revert')
        and c.target_page_id = any(v_moved_pages)
        and c."before" is distinct from (select p.blocks from public.pages p where p.id = c.target_page_id))
      or (c.action = 'edit_row'
        and private.change_log_row_id(c."before") = any(v_moved_rows)
        and not exists (
          select 1 from public.pages r
           where r.id = private.change_log_row_id(c."before")
             and r.title = c."before" ->> 'title'
             and (r.props - '_schema') = c."before" -> 'values'
        ))
    );
end;
$$;

commit;
