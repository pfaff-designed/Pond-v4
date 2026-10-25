-- ─── A move takes its link block with it (KAN-467 part A) ──────────────────
--
-- Why: `apply_page_move` (0030) reparents a page and reindexes its new
-- siblings, but the old parent's `blocks` jsonb still carries a `page-link`
-- row pointing at a child that no longer lives there (KAN-415 left this "for
-- the person to remove"). This part removes that stale link as part of the
-- same atomic move: the moved page's OWN `page-link` block is stripped from
-- the old parent's (or, for a top-level page, the pond's home row's)
-- `blocks`, and the removed block plus the index it sat at are recorded on
-- the `move` record's `before.removedLink` so undo (part C, a later
-- migration edit to this same file) can put it back exactly.
--
-- `private.page_link_parent_id` resolves which row actually carries the
-- structural link the same way `private.page_move_parent_title` (0030)
-- already resolves a parent for its TITLE: an explicit `p_parent_id` names
-- the row directly, `null` resolves to the pond's home row. A pond with no
-- home row yet (or a parent that no longer exists) resolves to nothing and
-- there is nothing to edit — the same tolerance `page_move_parent_title`
-- already has for a missing home row.
--
-- Only the moved page's OWN link is touched: the lookup matches a
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

-- Part C (a later migration edit to this file) calls this from
-- `change_log_set_back`, which is `security invoker` — that nested call will
-- need its own EXECUTE grant, same reasoning `page_is_self_or_descendant`'s
-- comment (0030) already gives.
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
  v_removed_block jsonb;
  v_removed_index integer;
  v_removed_link jsonb;
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
      select elem, ord - 1 into v_removed_block, v_removed_index
        from jsonb_array_elements(v_old_link_blocks) with ordinality as t(elem, ord)
       where elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_page_id::text
       limit 1;

      if v_removed_block is not null then
        update public.pages
           set blocks = (
                 select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
                   from jsonb_array_elements(v_old_link_blocks) with ordinality as t(elem, ord)
                  where ord - 1 <> v_removed_index
               ),
               updated_at = v_now
         where id = v_old_link_parent_id;

        v_removed_link := jsonb_build_object('block', v_removed_block, 'index', v_removed_index);
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
    ) || case when v_removed_link is not null
           then jsonb_build_object('removedLink', v_removed_link)
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
