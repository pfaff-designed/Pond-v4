-- ─── A tied sibling no longer sorts a duplicate's copy to the end (KAN-468) ─
--
-- Why: 0032's make-room step only shifted siblings whose `"order"` was
-- STRICTLY GREATER than the original's — but `createPage` inserts every new
-- page with the column default `0`, so the normal case is every sibling
-- TIED at `"order" = 0`. None of those got shifted, and the copy (inserted
-- at `v_page."order" + 1`) sorted after all of them once the rail's own
-- sort (`src/lib/rail/tree.ts`: by `"order"`, then `title`) broke the tie by
-- title instead of by position.
--
-- Fix: the make-room step now densely renumbers the parent's live children
-- (same `user_id`, `pond_id`, and null-safe `parent_id` scope 0032 already
-- used) by `("order", title, id)` — the exact order the rail itself sorts
-- by, with `id` as the final tiebreak for a title that also ties — instead
-- of shifting by the stale `"order"` value alone. Every sibling at or before
-- the original's rank keeps its dense rank unchanged; every sibling after it
-- is pushed up by one, opening a gap right after the original. The copy's
-- root then takes that gap by reading its OWN row's freshly-renumbered
-- `"order"` (`v_src."order" + 1` in pass 2, not the stale `v_page."order"`
-- captured before the renumber) plus one.
--
-- Nothing else in `duplicate_page` changes: this redefines ONLY that
-- function, verbatim from 0032 except the make-room step and that one
-- `+ 1` read. 0032 is already on production and is never edited in place.
--
-- Down (manual): re-run 0032's `create or replace function
--   public.duplicate_page` to restore the strictly-greater-only shift.

begin;

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

  -- Make room directly below the original before any id is minted: densely
  -- renumber the parent's live children by `("order", title, id)` — the
  -- rail's own sort — leaving a gap right after the original's new rank (see
  -- this migration's header). A sibling tied with the original on `"order"`
  -- (the common case) is reached by this renumber even though 0032's plain
  -- `"order" > v_page."order"` shift never touched it.
  with ranked as (
    select id, row_number() over (order by "order", title, id) - 1 as rnk
      from public.pages
     where user_id = v_page.user_id
       and pond_id is not distinct from v_page.pond_id
       and deleted_at is null
       and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_page.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  update public.pages p
     set "order" = case
           when r.rnk <= (select rnk from ranked where id = p_page_id) then r.rnk
           else r.rnk + 1
         end,
         updated_at = v_now
    from ranked r
   where p.id = r.id;

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
      -- `v_src."order"` is read fresh off `public.pages` by this very loop's
      -- own CTE, AFTER the make-room renumber above already ran — so for the
      -- root row (`v_src.id = p_page_id`) it already IS the renumbered rank,
      -- never the stale `v_page."order"` captured before that renumber.
      case when v_src.id = p_page_id then v_src."order" + 1 else v_src."order" end,
      v_src.glyph,
      v_src.area_role,
      v_now,
      v_now
    );
  end loop;

  -- Give the copy's root the same parent-page link treatment a move gives
  -- (see 0032's migration header's LINK APPEND note): a `page-link` block for
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
