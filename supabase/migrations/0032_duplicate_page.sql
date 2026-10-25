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
-- `after` carrying the new root's id (plus, when a link was appended — see
-- LINK APPEND below — the appended block's id and the row it landed on) —
-- the exact shape `accept_create_page_record` (0029) writes for a made page,
-- extended with those two optional keys. `private.change_log_undo_kind`
-- classifies it as `page` (re-created from 0030 part 2a's body verbatim,
-- adding this one arm); `change_log_set_back`'s EXISTING `page` branch (0029
-- part c) learns to remove that same link (see LINK APPEND) before it calls
-- `public.trash_page` on `target_page_id`, which cascades to the whole
-- copied subtree via the `parent_id ... on delete cascade` FK — so undoing a
-- duplicate takes the link off and trashes the copy and everything under it
-- in one call. Redo hits the same not-undoable gap 0029 already left open
-- for `create_page` (restoring a trashed subtree under RLS needs a definer
-- helper neither ticket builds).
--
-- `duplicate_page` is a distinct action rather than reusing `create_page` —
-- the change log's own "one record per action taken" law wants "duplicated a
-- page" distinguishable from "made a page" in its history, even though both
-- share the same undo machinery via the `page` kind.
--
-- LINK APPEND (KAN-468 part 5). The copy's root gets the same parent-page
-- link treatment a move gives (`apply_page_move`, 0031 part B): a
-- `page-link` block is appended onto whichever row actually carries the
-- structural link for `v_page.parent_id` (`private.page_link_parent_id`;
-- `null` resolves to the pond's home row, with the same tolerance for a
-- missing one). It lands right after the ORIGINAL's own link, if the parent
-- carries one; at the end of `blocks` otherwise — never duplicated, since a
-- page can carry at most one link to a given target (`appendChildLink`'s own
-- no-duplicate rule, mirrored here as everywhere else it matters). The
-- appended block's id and its parent row's id ride on the record's
-- `after.appendedLinkId`/`after.linkParentId` — enough for undo to remove it
-- by id, null-safe, in `change_log_set_back`'s `page` branch, the same shape
-- 0031 part C's `move` branch already uses for its own link edits.
--
-- NOT DUPLICABLE (KAN-468 part 4). The pond root (`type = 'home'`) and the
-- databases root are each a pond's one-per-kind row, same as `trash_page`
-- (0027) already guards — refused with `trash_page`'s own convention
-- (`errcode = 'invalid_parameter_value', detail = 'not-duplicable'`).
--
-- Down (manual):
--   drop function if exists public.duplicate_page(uuid, text, text);
--   drop function if exists private.rewrite_page_link_ids(jsonb, jsonb);
--   re-run 0030 part 2a's `create or replace function private.change_log_
--     undo_kind` to drop the `duplicate_page` arm;
--   re-run 0031 part C's `create or replace function private.change_log_
--     set_back` to drop the `page` branch's link removal.

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
  v_link_parent_id uuid;
  v_link_blocks jsonb;
  v_link_ord numeric;
  v_appended_link_id uuid;
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

  -- Give the copy's root the same parent-page link treatment a move gives
  -- (see the migration header's LINK APPEND note): a `page-link` block for
  -- `v_new_root_id`, on whichever row carries the structural link for this
  -- subtree's (unchanged) parent, right after the original's own link if
  -- there is one, else at the end.
  v_link_parent_id := private.page_link_parent_id(v_page.parent_id, v_page.pond_id, v_page.user_id);
  if v_link_parent_id is not null then
    select blocks into v_link_blocks from public.pages
      where id = v_link_parent_id and user_id = v_page.user_id and deleted_at is null
      for update;

    if found then
      select ord into v_link_ord
        from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
       where elem ->> 'type' = 'page-link' and elem ->> 'pageId' = p_page_id::text
       order by ord asc
       limit 1;

      v_appended_link_id := gen_random_uuid();
      if v_link_ord is not null then
        select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into v_link_blocks
          from (
            select elem, ord::numeric as ord
              from jsonb_array_elements(v_link_blocks) with ordinality as t(elem, ord)
            union all
            select jsonb_build_object('id', v_appended_link_id, 'type', 'page-link', 'pageId', v_new_root_id),
                   v_link_ord + 0.5
          ) s(elem, ord);
      else
        v_link_blocks := v_link_blocks || jsonb_build_array(
          jsonb_build_object('id', v_appended_link_id, 'type', 'page-link', 'pageId', v_new_root_id)
        );
      end if;

      update public.pages set blocks = v_link_blocks, updated_at = v_now
        where id = v_link_parent_id;
    end if;
  end if;

  insert into public.change_log
    (user_id, pond_id, status, action, actor, target_page_id,
     "before", "after", transitions, created_at, status_at)
  values (
    v_page.user_id, v_page.pond_id, 'accepted', 'duplicate_page', p_actor, v_new_root_id,
    null,
    jsonb_build_object('pageId', v_new_root_id) || case when v_appended_link_id is not null
      then jsonb_build_object('appendedLinkId', v_appended_link_id, 'linkParentId', v_link_parent_id)
      else '{}'::jsonb
    end,
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
-- Re-created from 0030 part 2a's body verbatim, adding only the
-- `duplicate_page` arm.
--
-- Down (manual): re-run 0030 part 2a's `create or replace function
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

-- ─── `change_log_set_back` learns to remove a duplicate's link (KAN-468) ───
--
-- Why: the LINK APPEND note (migration header, above) made `duplicate_page`
-- append a `page-link` block alongside the copy, but the `page` branch
-- (0029 part c) only ever trashed the copy itself — the appended link
-- stayed on whatever row it landed on. This gives that branch the same
-- null-safe link-removal shape 0031 part C's `move` branch already uses,
-- reusing that same branch's `v_link_parent_id`/`v_link_blocks` declares.
--
-- `p_from` here is `duplicate_page`'s own `after` (`change_log_step`'s own
-- pre-swap puts the record's `after` on `p_from` for undo) — the redo guard
-- right above (`p_from is null` → `not-undoable`) already rules out ever
-- reaching this with `p_from` null, so reading `p_from ->> 'appendedLinkId'`
-- unconditionally is safe. `appendedLinkId`/`linkParentId` are both present
-- only when the forward write actually landed a link (the migration
-- header's own LINK APPEND tolerance for a parentless pond with no home row
-- yet) — absent on every OTHER kind of `page` record (a plain `create_page`,
-- which never carries either key), so the `is not null` guard is a no-op
-- for those, not a new refusal.
--
-- Re-created from 0031 part C's body verbatim, adding only the link-removal
-- block inside the `page` branch, right after its redo guard and before its
-- `trash_page` call.
--
-- Down (manual): re-run 0031 part C's `create or replace function
--   private.change_log_set_back` to drop the link-removal block.

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
