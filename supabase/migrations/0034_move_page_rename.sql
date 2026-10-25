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
-- `p_new_title` is optional and defaults to `null` — every existing caller
-- (`public.move_page`, still 4 args) keeps writing exactly what it wrote
-- before, byte-identical. A stale client's `p_new_title` that still clashes
-- needs no new raise: folding `title` into the SAME reparent `update` means
-- `pages_sibling_title_pond_uniq` fires its own 23505 for it, the identical
-- error class a plain clashing move already raises today, which `movePage`'s
-- caller already turns into "Couldn't move".
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
-- Down (manual): re-run 0031's `create or replace function
--   private.apply_page_move` (drops the 5th parameter and the title writes).

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
