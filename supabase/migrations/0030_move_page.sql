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
    where id = p_page_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'page % not found', p_page_id
      using errcode = 'no_data_found', detail = 'not-found';
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
     where id = v_id and user_id = v_page.user_id;
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
