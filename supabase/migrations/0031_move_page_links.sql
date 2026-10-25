-- ─── A move takes its link block with it (KAN-467 part A) ──────────────────
--
-- Why: `apply_page_move` (0030) reparents a page and reindexes its new
-- siblings, but the old parent's `blocks` jsonb still carries a `page-link`
-- row pointing at a child that no longer lives there (KAN-415 left this "for
-- the person to remove"). This part removes that stale link as part of the
-- same atomic move: EVERY `page-link` block on the old parent's (or, for a
-- top-level page, the pond's home row's) `blocks` whose `pageId` is the
-- moved page is stripped, and each removed block plus the index it sat at is
-- recorded on the `move` record's `before.removedLinks` array so undo
-- (part C, below in this same file) can put every one of them back exactly,
-- in ascending index order.
--
-- `private.page_link_parent_id` resolves which row actually carries the
-- structural link the same way `private.page_move_parent_title` (0030)
-- already resolves a parent for its TITLE: an explicit `p_parent_id` names
-- the row directly, `null` resolves to the pond's home row. A pond with no
-- home row yet (or a parent that no longer exists) resolves to nothing and
-- there is nothing to edit — the same tolerance `page_move_parent_title`
-- already has for a missing home row.
--
-- Only the moved page's OWN links are touched: the lookup matches every
-- `page-link` block by `pageId = p_page_id` wherever it sits in the old
-- parent's `blocks`, which is also every `/link to page` link a person might
-- have added to that SAME target on that SAME page — `appendChildLink`'s own
-- no-duplicate rule means a page can never carry two links to one target, so
-- "the structural link" and "a manual link to the same page" can't be told
-- apart, and the ticket's rule only ever promises that OTHER pages' manual
-- links are untouched, never this one's.
--
-- The old parent's row is locked (`for update`) alongside the moved page
-- itself, before any write, so a concurrent move or edit of that same parent
-- can't race this one's read-modify-write of its `blocks`.
--
-- Part B adds the other half of the same move: the moved page's `page-link`
-- block is appended onto the NEW parent's (or home row's) `blocks`, unless
-- one is already there — the same no-duplicate rule `appendChildLink` (TS)
-- already enforces client-side, mirrored here so the two paths can't drift.
-- The appended block's `id` is a fresh `gen_random_uuid()`, never the
-- `derived-link:${childId}` convention `child-links.ts` reserves for the
-- ephemeral, never-persisted derive-at-read block. The new block's id alone
-- is recorded on the `move` record's `after.appendedLinkId` — enough for
-- undo to remove it by id.
--
-- Down (manual):
--   drop function if exists private.page_link_parent_id(uuid, uuid, uuid);
--   -- then re-run 0030's `create or replace function
--   private.apply_page_move` to drop the link-removal/append steps.

begin;

create or replace function private.page_link_parent_id(
  p_parent_id uuid,
  p_pond_id uuid,
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is not null then p_parent_id
    else (
      select id from public.pages
       where pond_id is not distinct from p_pond_id
         and user_id = p_user_id
         and type = 'home'
         and parent_id is null
       limit 1
    )
  end
$$;

-- Part C (below in this same file) calls this from `change_log_set_back`,
-- which is `security invoker` — that nested call needs its own EXECUTE
-- grant, same reasoning `page_is_self_or_descendant`'s comment (0030)
-- already gives.
revoke all on function private.page_link_parent_id(uuid, uuid, uuid) from public;
grant execute on function private.page_link_parent_id(uuid, uuid, uuid) to authenticated;

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
  v_old_link_parent_id uuid;
  v_old_link_blocks jsonb;
  v_removed_links jsonb;
  v_new_link_parent_id uuid;
  v_new_link_blocks jsonb;
  v_appended_link_id uuid;
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
  if p_new_parent_id is not null
     and private.page_is_self_or_descendant(p_page_id, p_new_parent_id)
  then
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

  -- Strip the moved page's own link from whichever row carries it (the old
  -- parent, or the home row for a top-level page) before this page's own
  -- `parent_id` changes below. Locked with the rest of this transaction's
  -- reads, ahead of any write.
  --
  -- Resolved against BOTH the old and the new parent up front: a same-parent
  -- reorder (Rail.tsx's `computeMove` calls `move_page` with an unchanged
  -- `p_new_parent_id` when a drag only reorders siblings) resolves both to
  -- the same row, and must change no link rows at all — ticket's own rule
  -- ("a same-parent reorder changes no link rows"). Without this guard, the
  -- link would be removed here and (part B) re-appended at the end of the
  -- same row's `blocks`, silently relocating it on every pure reorder.
  v_old_link_parent_id :=
    private.page_link_parent_id(v_old_parent_id, v_page.pond_id, v_page.user_id);
  v_new_link_parent_id :=
    private.page_link_parent_id(p_new_parent_id, v_page.pond_id, v_page.user_id);
  if v_old_link_parent_id is not null
     and v_old_link_parent_id is distinct from v_new_link_parent_id then
    select blocks into v_old_link_blocks from public.pages
      where id = v_old_link_parent_id and user_id = v_page.user_id and deleted_at is null
      for update;

    if found then
      select jsonb_agg(jsonb_build_object('block', elem, 'index', ord - 1) order by ord)
        into v_removed_links
        from jsonb_array_elements(v_old_link_blocks) with ordinality as t(elem, ord)
       where elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_page_id::text;

      if v_removed_links is not null then
        update public.pages
           set blocks = (
                 select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                   from jsonb_array_elements(v_old_link_blocks) with ordinality as t(elem, ord)
                  where not (elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_page_id::text)
               ),
               updated_at = v_now
         where id = v_old_link_parent_id;
      end if;
    end if;
  end if;

  update public.pages
     set parent_id = p_new_parent_id, updated_at = v_now
   where id = p_page_id;

  -- The reparent above is the write a malformed sibling order must not leave
  -- half-applied — see 0030's migration header.
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

  -- Append the moved page's link onto the new parent's (or home row's)
  -- `blocks`, mirroring `appendChildLink` (TS)'s own no-duplicate rule so the
  -- two paths can't drift. Skipped for the same-parent-reorder case the
  -- removal guard above already explains, and when the new row already
  -- carries the link (an unstamped parent that derive-at-read would have
  -- shown it under anyway — appending again would duplicate it).
  if v_new_link_parent_id is not null
     and v_new_link_parent_id is distinct from v_old_link_parent_id then
    select blocks into v_new_link_blocks from public.pages
      where id = v_new_link_parent_id and user_id = v_page.user_id and deleted_at is null
      for update;

    if found and not exists (
      select 1 from jsonb_array_elements(v_new_link_blocks) as elem
       where elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_page_id::text
    ) then
      v_appended_link_id := gen_random_uuid();
      update public.pages
         set blocks = v_new_link_blocks || jsonb_build_array(
               jsonb_build_object('id', v_appended_link_id, 'type', 'page-link', 'pageId', p_page_id)
             ),
             updated_at = v_now
       where id = v_new_link_parent_id;
    end if;
  end if;

  insert into public.change_log
    (user_id, pond_id, status, action, actor, target_page_id,
     "before", "after", transitions, created_at, status_at)
  values (
    v_page.user_id, v_page.pond_id, 'accepted', 'move', p_actor, p_page_id,
    jsonb_build_object(
      'parentId', v_old_parent_id,
      'parentTitle', v_old_parent_title,
      'siblingOrder', to_jsonb(coalesce(v_old_sibling_order, '{}'::uuid[]))
    ) || case when v_removed_links is not null
           then jsonb_build_object('removedLinks', v_removed_links)
           else '{}'::jsonb
         end,
    jsonb_build_object(
      'parentId', p_new_parent_id,
      'parentTitle', v_new_parent_title,
      'siblingOrder', to_jsonb(p_sibling_order)
    ) || case when v_appended_link_id is not null
           then jsonb_build_object('appendedLinkId', v_appended_link_id)
           else '{}'::jsonb
         end,
    jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
    v_now, v_now
  )
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function private.apply_page_move(uuid, uuid, uuid[], text) from public;
grant execute on function private.apply_page_move(uuid, uuid, uuid[], text) to authenticated;

commit;

-- ─── Undo/redo learn the link edit (KAN-467 part C) ────────────────────────
--
-- Why: parts A and B made the link edit ride inside `apply_page_move`'s own
-- `move` change_log record (`before.removedLinks`, `after.appendedLinkId`),
-- but `change_log_set_back`'s `move` branch (0030 part 2b) only ever put the
-- page itself back — the link(s) stayed wherever the forward move left them.
--
-- `change_log_step` (0021) already pre-swaps `p_from`/`p_to` for undo vs
-- redo: on undo, `p_from := v_record.after` (where the move landed, i.e. now)
-- and `p_to := v_record.before` (where it is going back to); on redo the two
-- are swapped. So one pass, keyed on which jsonb key each side actually
-- carries rather than on an undo/redo flag, covers both directions:
--
--   * `p_from` names "the link(s) as they now stand" and is always the side
--     to REMOVE block(s) from. On undo that is the appended link the
--     forward move made (`p_from.appendedLinkId`, by id). On redo that is
--     every link an earlier undo just put back (`p_from.removedLinks[].
--     block.id` — the exact block ids the original removal recorded).
--   * `p_to` names "the link(s) as they are going back to" and is always the
--     side to ADD block(s) to. On undo that is every original block,
--     reinserted at its recorded index, in ascending index order
--     (`p_to.removedLinks`). On redo that is a freshly built `page-link`
--     block for `p_to.appendedLinkId` (the same id the original append
--     used), appended at the end — mirroring the no-duplicate guard part B
--     already applies, in case the new parent's `blocks` picked up its own
--     link to this page in the meantime. Each reinsert skips a block whose
--     id, or whose link target, is already there, the same tolerance the
--     forward append already has.
--
-- Neither key is present on a same-parent reorder (parts A/B's own guard),
-- so this is a no-op for it, matching the forward RPC.
--
-- The reinsert-at-index math works by giving each restored element a
-- fractional ordinal position (`v_link_removed_index + 0.5`) among the
-- current blocks' own 1-based ordinals, so it sorts back between the exact
-- same neighbours it sat between before removal — the index recorded is
-- 0-based (matching part A's own `ord - 1`), and `+ 0.5` lands strictly
-- between the 1-based ordinal that WAS at that 0-based index and the one
-- before it. Restoring in ascending index order (the loop's own `order by`)
-- means every earlier reinsert has already landed before a later one's
-- index is interpreted, so multiple removed links come back in their
-- original relative order.
--
-- Re-created from 0030 part 2b's body verbatim, adding only the new declares
-- (`v_link_parent_id`, `v_link_blocks`, `v_link_removed_index`,
-- `v_link_removed_ids`, `v_link_entry`) and the link-edit block inside the
-- `move` branch, right before its `return null`.
--
-- Down (manual): re-run 0030's `create or replace function
--   private.change_log_set_back` to drop the link-edit block.

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
  v_link_parent_id uuid;
  v_link_blocks jsonb;
  v_link_removed_index integer;
  v_link_removed_ids text[];
  v_link_entry jsonb;
  v_link_blocks_snapshot jsonb;
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

    -- The parent being restored (or re-applied, on redo) to must not be the
    -- moved page itself, or now sit inside the moved page's own subtree —
    -- otherwise this would create a cycle (see the migration header's
    -- UNDO-CYCLE HARDENING note) even though the simple parent_id compare
    -- above found nothing stale.
    if p_to ->> 'parentId' is not null
       and private.page_is_self_or_descendant(
             p_record.target_page_id, (p_to ->> 'parentId')::uuid
           )
    then
      raise exception 'page % changed since change_log record %', p_record.target_page_id, p_record.id
        using errcode = 'P0001', detail = 'page-changed';
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

    -- Remove the link(s) as they now stand (see migration header): an
    -- `appendedLinkId` on `p_from` undoes the forward append by id; every
    -- entry of a `removedLinks` array on `p_from` (redo, undoing an earlier
    -- undo's put-back) removes that same block by the id it was originally
    -- recorded under.
    if p_from ? 'appendedLinkId' or p_from ? 'removedLinks' then
      v_link_parent_id := private.page_link_parent_id(
        case when p_from ->> 'parentId' is null then null else (p_from ->> 'parentId')::uuid end,
        p_record.pond_id, p_record.user_id
      );
      if v_link_parent_id is not null then
        select blocks into v_link_blocks from public.pages
          where id = v_link_parent_id and user_id = p_record.user_id and deleted_at is null
          for update;
        if found then
          select coalesce(array_agg(e -> 'block' ->> 'id'), array[]::text[])
            into v_link_removed_ids
            from jsonb_array_elements(coalesce(p_from -> 'removedLinks', '[]'::jsonb)) as e;
          if p_from ->> 'appendedLinkId' is not null then
            v_link_removed_ids := array_append(v_link_removed_ids, p_from ->> 'appendedLinkId');
          end if;
          update public.pages
             set blocks = (
                   select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                     from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
                    where coalesce((elem ->> 'id') = any(v_link_removed_ids), false) = false
                 ),
                 updated_at = now()
           where id = v_link_parent_id;
        end if;
      end if;
    end if;

    -- Put the link(s) back where they are going to (see migration header): a
    -- `removedLinks` array on `p_to` reinserts every original block at its
    -- recorded index, in ascending index order; an `appendedLinkId` on
    -- `p_to` (redo) rebuilds the appended block and appends it again. Each
    -- reinsert is skipped if a block with that id, or a link to that page,
    -- is already there — the same no-duplicate rule part B applies, in case
    -- the parent's `blocks` picked up its own link to the page in the
    -- meantime.
    if p_to ? 'removedLinks' or p_to ? 'appendedLinkId' then
      v_link_parent_id := private.page_link_parent_id(
        case when p_to ->> 'parentId' is null then null else (p_to ->> 'parentId')::uuid end,
        p_record.pond_id, p_record.user_id
      );
      if v_link_parent_id is not null then
        select blocks into v_link_blocks from public.pages
          where id = v_link_parent_id and user_id = p_record.user_id and deleted_at is null
          for update;
        if found then
          if p_to ? 'removedLinks' then
            -- Duplicate guard checks against the snapshot taken BEFORE this
            -- record's own removed links start coming back, not the array as
            -- it grows across loop iterations — two links this same record
            -- removed (both pointing at the moved page) must not see each
            -- other as "already there" and skip; only a link some OTHER
            -- cause (a manual re-link made between the move and this undo)
            -- added in the meantime should block a reinsert.
            v_link_blocks_snapshot := v_link_blocks;
            for v_link_entry in
              select value from jsonb_array_elements(p_to -> 'removedLinks') as value
              order by (value ->> 'index')::integer asc
            loop
              if not exists (
                select 1 from jsonb_array_elements(v_link_blocks_snapshot) as elem
                 where elem ->> 'id' = (v_link_entry -> 'block' ->> 'id')
                    or (elem ->> 'type' = 'page-link'
                        and elem ->> 'pageId' = (v_link_entry -> 'block' ->> 'pageId'))
              ) then
                v_link_removed_index := (v_link_entry ->> 'index')::integer;
                select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                  into v_link_blocks
                  from (
                    select elem, ord::numeric as ord
                      from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
                    union all
                    select (v_link_entry -> 'block'), v_link_removed_index + 0.5
                  ) s(elem, ord);
              end if;
            end loop;
            update public.pages set blocks = v_link_blocks, updated_at = now()
              where id = v_link_parent_id;
          elsif not exists (
            select 1 from jsonb_array_elements(v_link_blocks) as elem
             where elem ->> 'id' = (p_to ->> 'appendedLinkId')
                or (elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_record.target_page_id::text)
          ) then
            update public.pages
               set blocks = v_link_blocks || jsonb_build_array(
                     jsonb_build_object(
                       'id', p_to ->> 'appendedLinkId', 'type', 'page-link',
                       'pageId', p_record.target_page_id
                     )
                   ),
                   updated_at = now()
             where id = v_link_parent_id;
          end if;
        end if;
      end if;
    end if;

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
