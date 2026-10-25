// Schema tests for supabase/migrations/0037_undo_restore.sql part a (KAN-497).
//
// `change_log_undo_kind` is re-created from 0032's body (the latest, verified
// against origin/main) with one new arm: a `restore` record now classifies as
// kind `restore` instead of falling through to the unlisted-action `null`
// (which `undo_change_log_record` turns into `0A000 not-undoable`). Called
// directly here, against the owner connection (owners bypass RLS, so no
// `actAs` needed — this function reads nothing RLS would hide), rather than
// through the full undo flow: `change_log_set_back` carries no `restore`
// branch yet (that's part b), so the full flow isn't exercisable yet.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

const pondOf = async (db: PGlite): Promise<string> => {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [USER]
  )
  return res.rows[0].id
}

const addPage = async (
  db: PGlite,
  pondId: string,
  title = 'roof',
  parentId: string | null = null
): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, props, blocks)
     values ($1, $2, $3, 'page', $4, '{}'::jsonb, '[]'::jsonb) returning id`,
    [USER, pondId, parentId, title]
  )
  return res.rows[0].id
}

/** Supabase's grants and auth.uid(), which the harness's owner connection lacks. */
const actAs = async (db: PGlite, userId: string) => {
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    create or replace function auth.uid() returns uuid language sql stable as
      $fn$ select nullif(current_setting('test.uid', true), '')::uuid $fn$;
  `)
  await db.exec(`set test.uid = '${userId}'; set role authenticated;`)
}

const addRecord = async (
  db: PGlite,
  pondId: string,
  pageId: string,
  action: string
): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, pond_id, status, action, actor, target_page_id, "before", "after", transitions)
     values ($1, $2, 'accepted', $3, 'you', $4, null, '{}'::jsonb,
       jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', now(), 'actor', 'you')))
     returning id`,
    [USER, pondId, action, pageId]
  )
  return res.rows[0].id
}

const undoKindOf = async (db: PGlite, recordId: string): Promise<string | null> => {
  const res = await db.query<{ kind: string | null }>(
    `select private.change_log_undo_kind(c) as kind
     from public.change_log c where c.id = $1`,
    [recordId]
  )
  return res.rows[0].kind
}

describe('0037_undo_restore part a — change_log_undo_kind learns restore', () => {
  it('classifies a restore record as kind restore', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, pondId)
    const recordId = await addRecord(db, pondId, pageId, 'restore')

    expect(await undoKindOf(db, recordId)).toBe('restore')
    await db.close()
  })

  it('still classifies every existing action the same as before this migration', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, pondId)

    const expected: Record<string, string | null> = {
      edit: 'blocks',
      revert: 'blocks',
      add_row: 'row',
      edit_row: 'row',
      edit_glyph: 'glyph',
      edit_area_role: 'area_role',
      create_page: 'page',
      move: 'move',
      duplicate_page: 'page',
      delete: null,
    }

    for (const [action, kind] of Object.entries(expected)) {
      const recordId = await addRecord(db, pondId, pageId, action)
      expect(await undoKindOf(db, recordId)).toBe(kind)
    }
    await db.close()
  })
})

// Schema tests for supabase/migrations/0037_undo_restore.sql part b (KAN-497).
//
// `change_log_set_back`'s new `restore` branch, undo direction: re-trashes the
// page via `public.trash_page` (the same call the `page` kind's branch already
// makes for create/duplicate undo) and looks up the `delete` record that call
// just inserted, returning it as `deleteRecordId` for `change_log_step` to fold
// onto the new `undo` record's `before.position`. Run through the real
// `public.undo_change_log_record` RPC (the `actAs` pattern from
// change-log-undo-trash.pglite.test.ts), not the bare function, so RLS and the
// whole `change_log_step` flow are exercised, not just this one branch.

describe('0037_undo_restore part b — change_log_set_back re-trashes on undo of a restore', () => {
  it('re-trashes the page and its live children, and the undo record names a real delete record', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, pondId, 'roof')
    const childId = await addPage(db, pondId, 'skylight', pageId)

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [pageId])
    const firstDelete = await db.query<{ id: string }>(
      `select id from public.change_log where action = 'delete' and target_page_id = $1
       order by created_at desc limit 1`,
      [pageId]
    )
    await db.query('select public.restore_page($1)', [firstDelete.rows[0].id])
    const restoreRecord = await db.query<{ id: string }>(
      `select id from public.change_log where action = 'restore' and target_page_id = $1
       order by created_at desc limit 1`,
      [pageId]
    )
    const restoreRecordId = restoreRecord.rows[0].id

    await db.query(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [
      [restoreRecordId],
      pondId,
    ])

    const undoRecord = await db.query<{
      before: { position?: { deleteRecordId?: string } }
    }>(
      `select "before" from public.change_log
       where action = 'undo' and links ->> 'undo_of' = $1`,
      [restoreRecordId]
    )
    expect(undoRecord.rows).toHaveLength(1)
    const deleteRecordId = undoRecord.rows[0].before.position?.deleteRecordId
    expect(deleteRecordId).toBeTruthy()

    const namedDelete = await db.query<{ count: number }>(
      `select count(*)::int as count from public.change_log
       where id = $1 and action = 'delete' and target_page_id = $2`,
      [deleteRecordId, pageId]
    )
    expect(namedDelete.rows[0].count).toBe(1)
    expect(deleteRecordId).not.toBe(firstDelete.rows[0].id)

    await db.exec('reset role;')
    const pages = await db.query<{ id: string; deleted_at: string | null }>(
      `select id, deleted_at from public.pages where id in ($1, $2)`,
      [pageId, childId]
    )
    const byId = new Map(pages.rows.map((r) => [r.id, r]))
    expect(byId.get(pageId)?.deleted_at).not.toBeNull()
    expect(byId.get(childId)?.deleted_at).not.toBeNull()
    await db.close()
  })

  it('raises not-undoable for a restore record with no restore snapshot on p_from', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await pondOf(db)
    const pageId = await addPage(db, pondId)
    const record = await db.query<{ id: string }>(
      `insert into public.change_log
         (user_id, pond_id, status, action, actor, target_page_id, "before", "after", transitions)
       values ($1, $2, 'accepted', 'restore', 'you', $3, null, 'null'::jsonb,
         jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', now(), 'actor', 'you')))
       returning id`,
      [USER, pondId, pageId]
    )

    await actAs(db, USER)
    await expect(
      db.query(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [
        [record.rows[0].id],
        pondId,
      ])
    ).rejects.toMatchObject({ code: '0A000', detail: 'not-undoable' })
    await db.close()
  })
})
