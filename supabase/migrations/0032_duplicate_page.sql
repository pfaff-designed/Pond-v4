-- ─── Duplicate a page, with the pages inside it (KAN-468 part 1) ───────────
--
-- Why: Pond has no way to copy a page's whole subtree in one write. This adds
-- `duplicate_page`, mirroring `apply_page_move` (0030)'s own split: the
-- client computes the deduped root title (`nextAvailableTitle`, next ticket
-- step), this RPC commits the copy atomically.
--
-- WHAT IT COPIES. The subtree rooted at `p_page_id` — itself and every live
-- descendant, any depth — walked from `public.pages` itself (not a
-- client-built payload), scoped to `user_id = auth.uid() and deleted_at is
-- null`, the same ownership convention `trash_page`/`apply_page_move`
-- already use. Every column except `id`/`parent_id`/`order`/`created_at`/
-- `updated_at`/`deleted_at` is carried verbatim — `title` only for the root
-- (every other row keeps its source title; its new parent is the fresh copy
-- itself, which starts with no children, so no sibling can collide and no
-- further dedup is needed below the root). A `view` block (config-only; see
-- `src/lib/modules/view/schema.ts`) copies verbatim too: that already copies
-- the view, never the database it points at — "database blocks copy their
-- view, not the database" falls out of a literal `blocks` copy for free.
--
-- ID MAPPING. Pass 1 assigns every row in the subtree a fresh id before any
-- row is inserted, so pass 2 can resolve a parent's new id (and rewrite an
-- internal `page-link`) regardless of which order the walk visits rows in —
-- a forward link (a parent linking to a not-yet-copied descendant) would
-- resolve wrong if the map were built incrementally alongside the inserts.
-- Pass 2 then inserts ancestors before descendants (`order by depth asc`),
-- so the `parent_id` FK is never violated mid-walk.
--
-- LINK REWRITING. `private.rewrite_page_link_ids` rewrites a `page-link`
-- block's `pageId` only when that target is IN the id map, i.e. inside the
-- copied subtree — a manual link to something outside it is left pointing at
-- the original, which is correct: nothing outside the subtree was duplicated.
--
-- PLACEMENT. The copy's root lands directly below the original: every later
-- sibling's `"order"` is shifted up by one (a single UPDATE, not a client-
-- supplied array — this only ever inserts ONE new sibling right after a known
-- position, unlike `move_page`'s dense reindex of an arbitrary destination
-- group), and the new root takes the vacated slot.
--
-- LOGGING AND UNDO. One `accepted` `duplicate_page` record, `before` null,
-- `after` carrying the new root's id — the exact shape `accept_create_page_
-- record` (0029) writes for a made page. `private.change_log_undo_kind`
-- classifies it as `page` (re-created from 0031's body verbatim, adding this
-- one arm); `change_log_set_back`'s EXISTING `page` branch (0029 part c) is
-- untouched and already does the rest: it calls `public.trash_page` on
-- `target_page_id`, which cascades to the whole copied subtree via the
-- `parent_id ... on delete cascade` FK — so undoing a duplicate trashes the
-- copy and everything under it in one call. Redo hits the same not-undoable
-- gap 0029 already left open for `create_page` (restoring a trashed subtree
-- under RLS needs a definer helper neither ticket builds).
--
-- `duplicate_page` is a distinct action rather than reusing `create_page` —
-- the change log's own "one record per action taken" law wants "duplicated a
-- page" distinguishable from "made a page" in its history, even though both
-- share the same undo machinery via the `page` kind.
--
-- NOT DUPLICABLE (KAN-468 part 4). The pond root (`type = 'home'`) and the
-- databases root are each a pond's one-per-kind row, same as `trash_page`
-- (0027) already guards — refused with `trash_page`'s own convention
-- (`errcode = 'invalid_parameter_value', detail = 'not-duplicable'`).
--
-- Down (manual):
--   drop function if exists public.duplicate_page(uuid, text, text);
--   drop function if exists private.rewrite_page_link_ids(jsonb, jsonb);
--   re-run 0031's `create or replace function private.change_log_undo_kind`
--     to drop the `duplicate_page` arm.

begin;

-- Rewrites a `page-link` block's `pageId` to its copy's id when that id is a
-- key in `p_id_map` — i.e. the link's target was itself copied. A link to
-- something outside the copied subtree is left untouched.
create or replace function private.rewrite_page_link_ids(
  p_blocks jsonb,
  p_id_map jsonb
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      case
        when elem ->> 'type' = 'page-link' and p_id_map ? (elem ->> 'pageId')
          then elem || jsonb_build_object('pageId', p_id_map ->> (elem ->> 'pageId'))
        else elem
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) with ordinality as t(elem, ord)
$$;

create or replace function public.duplicate_page(
  p_page_id uuid,
  p_title text,
  p_actor text default 'you'
)
returns public.change_log
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page public.pages;
  v_now timestamptz := now();
  v_record public.change_log;
  v_id_map jsonb := '{}'::jsonb;
  v_new_root_id uuid;
  v_src record;
begin
  select * into v_page from public.pages
    where id = p_page_id and user_id = auth.uid() and deleted_at is null
    for update;
  if not found then
    raise exception 'page % not found', p_page_id
      using errcode = 'no_data_found', detail = 'not-found';
  end if;

  -- The pond root (`type = 'home'`) and the databases root (a top-level page
  -- titled "databases") are each a pond's one-per-kind root, same as
  -- `trash_page` (0027) already guards — copying either verbatim would try to
  -- insert a second one and fail on `pages_one_root_per_pond` (home) or just
  -- silently duplicate every database and record under a top-level "databases
  -- 2" (the root itself has no such constraint). Neither is ever duplicable.
  if v_page.type = 'home'
     or (v_page.parent_id is null and lower(btrim(v_page.title)) = 'databases')
  then
    raise exception 'page % cannot be duplicated', p_page_id
      using errcode = 'invalid_parameter_value', detail = 'not-duplicable';
  end if;

  -- Make room directly below the original before any id is minted: shift
  -- every later sibling up by one.
  update public.pages
     set "order" = "order" + 1, updated_at = v_now
   where user_id = v_page.user_id
     and pond_id is not distinct from v_page.pond_id
     and deleted_at is null
     and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(v_page.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and "order" > v_page."order";

  -- Pass 1: a fresh id for every row in the subtree, before any row is
  -- inserted — see the migration header's ID MAPPING note.
  for v_src in
    with recursive subtree as (
      select id from public.pages
       where id = p_page_id and user_id = v_page.user_id and deleted_at is null
      union all
      select p.id from public.pages p
        join subtree s on p.parent_id = s.id
       where p.user_id = v_page.user_id and p.deleted_at is null
    )
    select id from subtree
  loop
    v_id_map := v_id_map || jsonb_build_object(v_src.id::text, gen_random_uuid()::text);
  end loop;

  v_new_root_id := (v_id_map ->> p_page_id::text)::uuid;

  -- Pass 2: insert each copy, ancestors before descendants, so `parent_id`'s
  -- FK is never violated mid-walk.
  for v_src in
    with recursive subtree as (
      select id, 0 as depth from public.pages
       where id = p_page_id and user_id = v_page.user_id and deleted_at is null
      union all
      select p.id, s.depth + 1 from public.pages p
        join subtree s on p.parent_id = s.id
       where p.user_id = v_page.user_id and p.deleted_at is null
    )
    select pg.*, subtree.depth
      from subtree
      join public.pages pg on pg.id = subtree.id
     order by subtree.depth asc, pg."order" asc
  loop
    insert into public.pages
      (id, user_id, pond_id, parent_id, type, title, blocks, embedding, status, props,
       "order", glyph, area_role, created_at, updated_at)
    values (
      (v_id_map ->> v_src.id::text)::uuid,
      v_src.user_id,
      v_src.pond_id,
      case when v_src.id = p_page_id then v_page.parent_id
        else (v_id_map ->> v_src.parent_id::text)::uuid end,
      v_src.type,
      case when v_src.id = p_page_id then p_title else v_src.title end,
      private.rewrite_page_link_ids(v_src.blocks, v_id_map),
      v_src.embedding,
      v_src.status,
      v_src.props,
      case when v_src.id = p_page_id then v_page."order" + 1 else v_src."order" end,
      v_src.glyph,
      v_src.area_role,
      v_now,
      v_now
    );
  end loop;

  insert into public.change_log
    (user_id, pond_id, status, action, actor, target_page_id,
     "before", "after", transitions, created_at, status_at)
  values (
    v_page.user_id, v_page.pond_id, 'accepted', 'duplicate_page', p_actor, v_new_root_id,
    null,
    jsonb_build_object('pageId', v_new_root_id),
    jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', v_now, 'actor', p_actor)),
    v_now, v_now
  )
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function public.duplicate_page(uuid, text, text) from public;
grant execute on function public.duplicate_page(uuid, text, text) to authenticated;

commit;

-- ─── `change_log_undo_kind` learns `duplicate_page` (KAN-468) ──────────────
--
-- Re-created from 0031's body verbatim, adding only the `duplicate_page` arm.
--
-- Down (manual): re-run 0031's `create or replace function
--   private.change_log_undo_kind` to drop the `duplicate_page` arm.

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
    when 'duplicate_page' then 'page'
  end;
end;
$$;

commit;
