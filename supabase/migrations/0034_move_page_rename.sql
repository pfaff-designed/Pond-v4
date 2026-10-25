-- ─── A move into a same-named sibling suffixes the mover, not a refusal (KAN-470 part A) ──
--
-- Why: moving a page into a parent that already has a same-titled child hits
-- `pages_sibling_title_pond_uniq` (0018) and surfaces as "Couldn't move" — the
-- only path today is to rename first, then move. `createPage` already
-- auto-suffixes a clashing title (`nextAvailableTitle`,
-- src/lib/pages/dedupe-title.ts) instead of refusing; this ticket makes a move
-- match that rule. The client (the one home for the suffix rule) computes the
-- next available title and passes it as `p_new_title`; this function only
-- writes it, atomically, alongside the reparent it already does.
--
-- `p_new_title` is optional and defaults to `null` — a call that omits it
-- keeps writing exactly what it wrote before, byte-identical. A stale
-- client's `p_new_title` that still clashes needs no new raise: folding
-- `title` into the SAME reparent `update` means `pages_sibling_title_pond_uniq`
-- fires its own 23505 for it, the identical error class a plain clashing move
-- already raises today, which `movePage`'s caller already turns into
-- "Couldn't move".
--
-- `public.move_page` (part C, below) is widened to the same 4-arg shape
-- (`p_new_title text default null`, forwarding it here) — without that, the
-- client's `movePage` call reaches PostgREST with a `p_new_title` key no
-- deployed function declares, and PostgREST finds no matching overload at
-- all: every renaming move would fail live, not just a clashing one.
--
-- The move record's `before`/`after` each gain an optional `title` key, only
-- when a rename actually happened (`p_new_title is not null`) — the same
-- reversibility 0031's `removedLinks`/`appendedLinkId` already use, so every
-- move record written before this migration, and every move that doesn't
-- clash, parses exactly as before. `before.title` is read off `v_page.title`
-- (the row fetched at the very top, before this function's own update),
-- i.e. the page's title going into the move; `after.title` is `p_new_title`
-- itself.
--
-- Re-created from 0031's `apply_page_move` body verbatim, adding only the new
-- parameter, the `title` assignment on the existing reparent `update`, and the
-- two conditional `title` keys on the change_log insert.
--
-- Down (manual): `drop function private.apply_page_move(uuid, uuid, uuid[],
--   text, text);` (this migration's 5-arg signature) before re-running 0031's
--   `create or replace function private.apply_page_move` body — otherwise the
--   5-arg function survives alongside 0031's 4-arg one, the same ambiguity
--   this migration's own forward step drops first, above. Then do the same
--   for `public.move_page` — see part C, below.

begin;

-- `create or replace` identifies a function by its argument TYPE list, not by
-- name + defaults — adding a trailing parameter (even a defaulted one) would
-- otherwise create a second, overloaded function alongside the 4-arg one from
-- 0031, and a 4-arg call (`public.move_page`'s own, among others) would then
-- be ambiguous between the two. Drop the old signature first so there is
-- exactly one `apply_page_move` again.
drop function if exists private.apply_page_move(uuid, uuid, uuid[], text);

create or replace function private.apply_page_move(
  p_page_id uuid,
  p_new_parent_id uuid,
  p_sibling_order uuid[],
  p_actor text default 'you',
  p_new_title text default null
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
     set parent_id = p_new_parent_id,
         title = coalesce(p_new_title, title),
         updated_at = v_now
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
         end
      || case when p_new_title is not null
           then jsonb_build_object('title', v_page.title)
           else '{}'::jsonb
         end,
    jsonb_build_object(
      'parentId', p_new_parent_id,
      'parentTitle', v_new_parent_title,
      'siblingOrder', to_jsonb(p_sibling_order)
    ) || case when v_appended_link_id is not null
           then jsonb_build_object('appendedLinkId', v_appended_link_id)
           else '{}'::jsonb
         end
      || case when p_new_title is not null
           then jsonb_build_object('title', p_new_title)
           else '{}'::jsonb
         end,
    jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
    v_now, v_now
  )
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function private.apply_page_move(uuid, uuid, uuid[], text, text) from public;
grant execute on function private.apply_page_move(uuid, uuid, uuid[], text, text) to authenticated;

commit;

-- ─── `change_log_set_back`'s `move` branch learns the title (KAN-470 part B) ──
--
-- Why: part A (above) made a move's own forward write able to rename the
-- page atomically; undo/redo must restore/re-apply that title in the SAME
-- step it already restores/re-applies `parent_id`, or the rename would need
-- a separate, non-atomic undo of its own. `title` is present on `p_from`/
-- `p_to` only when the forward write actually renamed the page (part A's own
-- optional key), so every pre-KAN-470 move record, and every move that
-- didn't clash, is unaffected: both the staleness check and the `update`
-- below are no-ops for them.
--
-- The staleness check mirrors the existing `parentId` one right above it:
-- the page's CURRENT title must still equal the title the move recorded as
-- going in (`p_from ->> 'title'`), else something else renamed the page in
-- the meantime and this raises the same `page % changed since change_log
-- record %` / `page-changed` the parent check already raises for the same
-- reason. Skipped entirely when `p_from` carries no `title` key at all.
--
-- Re-created from 0032's `change_log_set_back` body verbatim (0032 is on
-- main; its `move` branch is itself byte-identical to 0031's, so basing this
-- on 0032 drops nothing).
-- The only changes: `v_title` is now also selected alongside `v_parent_id`,
-- the new staleness check sits right after the `parentId` one, and the
-- reparent `update` gains `title = coalesce(p_to ->> 'title', title)`.
--
-- Down (manual): re-run 0032's `create or replace function
--   private.change_log_set_back` to drop the title staleness check and the
--   title assignment on the `update`.

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

    select parent_id, title into v_parent_id, v_title from public.pages
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

    -- A rename made atomically with this move (part A) must still be the
    -- title going in, or something else renamed the page since — the same
    -- staleness rule the parent check above applies, for the same reason.
    -- No-op when the move never carried a `title` key at all.
    if p_from ? 'title' and v_title is distinct from (p_from ->> 'title') then
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
           title = coalesce(p_to ->> 'title', title),
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

    -- A duplicate's own appended link (KAN-468): null-safe, the same shape
    -- the `move` branch above uses for its link edits. `appendedLinkId`/
    -- `linkParentId` are both present on `p_from` only when the forward
    -- write actually landed a link (the migration header's own LINK APPEND
    -- tolerance for a parentless pond with no home row yet); absent on
    -- every other `page` record (a plain `create_page`), so this is a no-op
    -- for those.
    if p_from ->> 'appendedLinkId' is not null and p_from ->> 'linkParentId' is not null then
      v_link_parent_id := (p_from ->> 'linkParentId')::uuid;
      select blocks into v_link_blocks from public.pages
        where id = v_link_parent_id and user_id = p_record.user_id and deleted_at is null
        for update;
      if found then
        update public.pages
           set blocks = (
                 select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                   from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
                  where (elem ->> 'id') is distinct from (p_from ->> 'appendedLinkId')
               ),
               updated_at = now()
         where id = v_link_parent_id;
      end if;
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

-- ─── `public.move_page` forwards `p_new_title` (KAN-470 part C) ──
--
-- Why: part A gave `private.apply_page_move` an optional 5th parameter, but
-- the PostgREST-facing wrapper the client actually calls — `public.move_page`
-- — was still 0030's 3-arg signature, with no way to carry a title through
-- at all. `movePage` (src/lib/pages/client.ts) sends `p_new_title` to
-- `rpc('move_page', …)` whenever a rename is needed; PostgREST resolves an
-- RPC call by matching the named arguments against a function's declared
-- parameters, so a `p_new_title` key with no 4-arg `move_page` to match
-- means NO function matches at all (not a silent ignore) — every renaming
-- move fails live with "Couldn't move", even though part A's own SQL is
-- correct. Widening this wrapper is the only remaining step.
--
-- `create or replace function` identifies a function by its argument TYPE
-- list, the same reason part A above had to `drop function` first: adding a
-- trailing parameter to the existing 3-arg `move_page` would create a SECOND,
-- overloaded function rather than replacing it, and a 3-arg call (a stale
-- client, or any call that omits the new argument) would then be ambiguous
-- between the two. Drop the old signature first so there is exactly one
-- `move_page` again.
--
-- `p_new_title` defaults to `null` and is forwarded straight through to
-- `private.apply_page_move`'s own 5th parameter — identical
-- language/security/search_path to 0030's wrapper (`language sql`, no
-- `security definer` here; the privilege boundary is `apply_page_move`'s
-- own), so a call that omits it is byte-identical to today.
--
-- Down (manual): `drop function public.move_page(uuid, uuid, uuid[], text);`
--   (this migration's 4-arg signature) before re-running 0030's
--   `create or replace function public.move_page` body and its grants —
--   otherwise the 4-arg function survives alongside 0030's 3-arg one. And
--   see part A's own down note above for `private.apply_page_move`.

begin;

drop function if exists public.move_page(uuid, uuid, uuid[]);

create or replace function public.move_page(
  p_page_id uuid,
  p_new_parent_id uuid,
  p_sibling_order uuid[],
  p_new_title text default null
)
returns public.change_log
language sql
set search_path = public, pg_temp
as $$
  select * from private.apply_page_move(p_page_id, p_new_parent_id, p_sibling_order, 'you', p_new_title)
$$;

revoke all on function public.move_page(uuid, uuid, uuid[], text) from public;
grant execute on function public.move_page(uuid, uuid, uuid[], text) to authenticated;

commit;
