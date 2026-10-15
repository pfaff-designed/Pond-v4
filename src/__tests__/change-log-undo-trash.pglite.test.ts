// Schema tests for supabase/migrations/0028_restore_position.sql part b (KAN-312).
//
// `change_log_set_back` (0024's body, re-created here with one line changed)
// runs as the CALLER, so its guard against removing an added row that "has had
// more written into it" must see every child row, trashed included, or RLS
// (0027) hides a trashed child and undoing the add permanently deletes it along
// with the row (`parent_id ... on delete cascade`). Run as `authenticated` (the
// `actAs` pattern from first-run.pglite.test.ts) — the PGlite owner connection
// bypasses RLS entirely, which would hide the bug this migration fixes.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

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

async function lifePondId(db: PGlite): Promise<string> {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [USER]
  )
  return res.rows[0].id
}

/** Inserted as the table owner (setup only) — RLS is switched on afterward via actAs. */
async function addPage(
  db: PGlite,
  pondId: string,
  opts: { parentId?: string | null; type?: string; title?: string }
): Promise<string> {
  const { parentId = null, type = 'page', title = 'Untitled' } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, props, blocks)
     values ($1, $2, $3, $4, $5, '{}'::jsonb, '[]'::jsonb) returning id`,
    [USER, pondId, parentId, type, title]
  )
  return res.rows[0].id
}

async function addAddRowRecord(
  db: PGlite,
  pondId: string,
  collectionId: string,
  rowId: string,
  title: string
): Promise<string> {
  const after = { id: rowId, title, values: {} }
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, pond_id, status, action, actor, target_page_id, "before", "after", transitions)
     values ($1, $2, 'accepted', 'add_row', 'you', $3, null, $4,
       jsonb_build_array(jsonb_build_object('status', 'accepted', 'at', now(), 'actor', 'you')))
     returning id`,
    [USER, pondId, collectionId, JSON.stringify(after)]
  )
  return res.rows[0].id
}

const undo = (db: PGlite, recordId: string, pondId: string) =>
  db.query(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [[recordId], pondId])

const redo = (db: PGlite, recordId: string, pondId: string) =>
  db.query(`select * from public.redo_change_log_record($1::uuid[], $2, 'you')`, [[recordId], pondId])

describe('0028_restore_position part b — undoing an add_row sees trashed children', () => {
  it("refuses the undo with 'record-changed' and leaves a trashed child in place", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const recipes = await addPage(db, pondId, { title: 'recipes' })
    const rowId = await addPage(db, pondId, { parentId: recipes, type: 'row', title: 'dal' })
    const childId = await addPage(db, pondId, { parentId: rowId, title: 'notes on dal' })
    const added = await addAddRowRecord(db, pondId, recipes, rowId, 'dal')

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [childId])

    await expect(undo(db, added, pondId)).rejects.toMatchObject({
      code: 'P0001',
      detail: 'record-changed',
    })

    await db.exec('reset role;')
    const row = await db.query<{ count: number }>(
      'select count(*)::int as count from public.pages where id = $1',
      [rowId]
    )
    expect(row.rows[0].count).toBe(1)
    const child = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [childId]
    )
    expect(child.rows[0]?.deleted_at).not.toBeNull()
    await db.close()
  })

  it('still deletes the row on undo when it has no children', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const recipes = await addPage(db, pondId, { title: 'recipes' })
    const rowId = await addPage(db, pondId, { parentId: recipes, type: 'row', title: 'dal' })
    const added = await addAddRowRecord(db, pondId, recipes, rowId, 'dal')

    await actAs(db, USER)
    await undo(db, added, pondId)

    await db.exec('reset role;')
    const row = await db.query<{ count: number }>(
      'select count(*)::int as count from public.pages where id = $1',
      [rowId]
    )
    expect(row.rows[0].count).toBe(0)
    await db.close()
  })
})

// Schema tests for supabase/migrations/0029_undo_create_page.sql part a (KAN-179).
//
// `recordPageProposal` (src/lib/pages/make-page.ts) writes a `create_page`
// record before the page exists, so its `target_page_id` and `after` carry no
// page id. `accept_create_page_record` is the one place that gets stamped on,
// in the same statement the record advances to `accepted` — the only way
// undo (KAN-93) later has something to trash.

async function addCreatePageRecord(
  db: PGlite,
  pondId: string,
  opts: { status?: string } = {}
): Promise<string> {
  const { status = 'proposed' } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, pond_id, status, action, actor, target_page_id, "before", "after", transitions)
     values ($1, $2, $3, 'create_page', 'you', null, null, $4, $5)
     returning id`,
    [
      USER,
      pondId,
      status,
      JSON.stringify({ title: 'renovation blockers' }),
      JSON.stringify([{ status, at: new Date().toISOString(), actor: 'you' }]),
    ]
  )
  return res.rows[0].id
}

const acceptCreatePage = (db: PGlite, recordId: string, pageId: string) =>
  db.query(`select * from public.accept_create_page_record($1, $2, 'you')`, [recordId, pageId])

describe('0029_undo_create_page part a — accept_create_page_record', () => {
  it('accepting a proposed create_page record sets target_page_id and after.pageId', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const pageId = await addPage(db, pondId, { title: 'renovation blockers' })
    const recordId = await addCreatePageRecord(db, pondId)

    await actAs(db, USER)
    const res = await acceptCreatePage(db, recordId, pageId)

    expect(res.rows[0]).toMatchObject({
      status: 'accepted',
      target_page_id: pageId,
      after: { title: 'renovation blockers', pageId },
    })
    await db.close()
  })

  it('accepting an already-settled record is refused like a re-decision', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const pageId = await addPage(db, pondId, { title: 'renovation blockers' })
    const recordId = await addCreatePageRecord(db, pondId, { status: 'accepted' })

    await actAs(db, USER)
    await expect(acceptCreatePage(db, recordId, pageId)).rejects.toMatchObject({
      code: 'P0001',
      detail: 'record-changed',
    })
    await db.close()
  })
})

// Schema tests for supabase/migrations/0029_undo_create_page.sql part c (KAN-179).
//
// `change_log_undo_kind` classifies `create_page` as `page` (part b, above),
// and `change_log_set_back`'s new `page` branch (part c) is what actually
// trashes the made page on undo — by calling `public.trash_page` (0027)
// directly, KAN-97's own trash path, rather than a second hand-rolled walk.
// That means the undo also gets a `delete` change_log record with a
// TrashSnapshot, and `restore_page` (0027) can bring the page back, exactly
// like any other trashed page. Redo stays refused `not-undoable` (restoring
// a trashed subtree under RLS needs a SECURITY DEFINER helper, out of this
// ticket).

async function deleteRecordFor(db: PGlite, pageId: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `select id from public.change_log where action = 'delete' and target_page_id = $1
     order by created_at desc limit 1`,
    [pageId]
  )
  return res.rows[0].id
}

describe('0029_undo_create_page part c — change_log_set_back trashes a made page on undo', () => {
  it('moves the made page and a live child page to trash, not a hard delete', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const pageId = await addPage(db, pondId, { title: 'renovation blockers' })
    const childId = await addPage(db, pondId, { parentId: pageId, title: 'paint colours' })
    const recordId = await addCreatePageRecord(db, pondId)

    await actAs(db, USER)
    await acceptCreatePage(db, recordId, pageId)
    await undo(db, recordId, pondId)

    await db.exec('reset role;')
    const rows = await db.query<{ id: string; deleted_at: string | null }>(
      'select id, deleted_at from public.pages where id in ($1, $2)',
      [pageId, childId]
    )
    expect(rows.rows).toHaveLength(2)
    for (const row of rows.rows) {
      expect(row.deleted_at).not.toBeNull()
    }
    await db.close()
  })

  it("leaves a 'delete' record with a TrashSnapshot, and restore_page brings the page back", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const pageId = await addPage(db, pondId, { title: 'renovation blockers' })
    const recordId = await addCreatePageRecord(db, pondId)

    await actAs(db, USER)
    await acceptCreatePage(db, recordId, pageId)
    await undo(db, recordId, pondId)

    const deleteRecordId = await deleteRecordFor(db, pageId)
    const log = await db.query<{
      status: string
      before: { title: string; pageIds: string[] }
    }>('select status, "before" from public.change_log where id = $1', [deleteRecordId])
    expect(log.rows[0].status).toBe('accepted')
    expect(log.rows[0].before).toMatchObject({ title: 'renovation blockers' })
    expect(log.rows[0].before.pageIds).toEqual([pageId])

    await db.query('select public.restore_page($1)', [deleteRecordId])

    await db.exec('reset role;')
    const row = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [pageId]
    )
    expect(row.rows[0]?.deleted_at).toBeNull()
    await db.close()
  })

  it('refuses a second undo of the same record as already-undone', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const pageId = await addPage(db, pondId, { title: 'renovation blockers' })
    const recordId = await addCreatePageRecord(db, pondId)

    await actAs(db, USER)
    await acceptCreatePage(db, recordId, pageId)
    await undo(db, recordId, pondId)

    await expect(undo(db, recordId, pondId)).rejects.toMatchObject({
      code: '22023',
      detail: 'already-undone',
    })
    await db.close()
  })

  it('refuses redo of the undone create_page record as not-undoable', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    const pageId = await addPage(db, pondId, { title: 'renovation blockers' })
    const recordId = await addCreatePageRecord(db, pondId)

    await actAs(db, USER)
    await acceptCreatePage(db, recordId, pageId)
    await undo(db, recordId, pondId)

    await expect(redo(db, recordId, pondId)).rejects.toMatchObject({
      code: '0A000',
      detail: 'not-undoable',
    })
    await db.close()
  })
})
