-- ─── Part a: `change_log_undo_kind` learns `restore` (KAN-497) ─────────────
--
-- Why: a `restore` record (0027's `restore_page`) raised `0A000 not-undoable`
-- (0021's unlisted-action default) because `change_log_undo_kind`'s case
-- never named it. Classifying it as its own kind, `restore` (not reusing
-- `page` — `page`'s redo is hard-refused by design (0029), but this record's
-- own redo must actually restore again), is the one step this part owns;
-- `change_log_set_back` still carries no `restore` branch until part b.
--
-- Re-created from 0032's body verbatim (the latest redefinition), adding
-- only the `restore` arm.
--
-- Down (manual): re-run 0032's `create or replace function
--   private.change_log_undo_kind` to drop the `restore` arm.

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
    when 'restore' then 'restore'
  end;
end;
$$;

commit;
