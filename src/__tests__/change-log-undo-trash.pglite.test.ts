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
