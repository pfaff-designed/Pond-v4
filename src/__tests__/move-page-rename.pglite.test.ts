// Schema tests for 0034_move_page_rename.sql part A (KAN-470): `apply_page_move`
// gains an optional `p_new_title` that renames the moved page atomically with
// the reparent, and records both titles on the `move` record's before/after
// only when a rename actually happened. Called directly against
// `private.apply_page_move` — `public.move_page` doesn't forward this
// argument yet.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

const actAs = async (db: PGlite, userId: string) => {
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    create or replace function auth.uid() returns uuid language sql stable as
      $fn$ select nullif(current_setting('test.uid', true), '')::uuid $fn$;
  `)
  await db.exec(`set test.uid = '${userId}'; set role authenticated;`)
}

const lifePondId = async (db: PGlite, userId: string = USER): Promise<string> => {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [userId]
  )
  return res.rows[0].id
}

const addPage = async (
  db: PGlite,
  pondId: string,
  opts: { parentId?: string | null; title?: string; order?: number; userId?: string } = {}
): Promise<string> => {
  const { parentId = null, title = 'Untitled', order = 0, userId = USER } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, "order")
     values ($1, $2, $3, 'page', $4, $5) returning id`,
    [userId, pondId, parentId, title, order]
  )
  return res.rows[0].id
}

const titleOf = async (db: PGlite, pageId: string): Promise<string> => {
  const res = await db.query<{ title: string }>('select title from public.pages where id = $1', [
    pageId,
  ])
  return res.rows[0].title
}

interface MoveRecord {
  id: string
  before: { title?: string }
  after: { title?: string }
}

const lastMoveRecordFor = async (db: PGlite, pageId: string): Promise<MoveRecord> => {
  const res = await db.query<MoveRecord>(
    `select id, before, after from public.change_log
      where action = 'move' and target_page_id = $1
      order by created_at desc
      limit 1`,
    [pageId]
  )
  return res.rows[0]
}

const applyMove = (
  db: PGlite,
  pageId: string,
  newParentId: string | null,
  siblingOrder: string[],
  newTitle?: string | null
) =>
  db.query('select * from private.apply_page_move($1, $2, $3, $4, $5)', [
    pageId,
    newParentId,
    siblingOrder,
    'you',
    newTitle ?? null,
  ])

describe('0034_move_page_rename — apply_page_move renames atomically with the reparent', () => {
  it('renames the moved page and records both titles when p_new_title is given', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { title: 'Notes' })

    await actAs(db, USER)
    await applyMove(db, moved, house, [moved], 'Notes 2')
    await db.exec('reset role;')

    expect(await titleOf(db, moved)).toBe('Notes 2')
    const record = await lastMoveRecordFor(db, moved)
    expect(record.before.title).toBe('Notes')
    expect(record.after.title).toBe('Notes 2')
    await db.close()
  })

  it('leaves the title and the move record unchanged when p_new_title is omitted', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { title: 'Notes' })

    await actAs(db, USER)
    await applyMove(db, moved, house, [moved])
    await db.exec('reset role;')

    expect(await titleOf(db, moved)).toBe('Notes')
    const record = await lastMoveRecordFor(db, moved)
    expect(record.before.title).toBeUndefined()
    expect(record.after.title).toBeUndefined()
    await db.close()
  })

  it('raises the same unique-violation a clashing move already raises when p_new_title still clashes', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const house = await addPage(db, pond, { title: 'house' })
    await addPage(db, pond, { parentId: house, title: 'Notes 2' })
    const moved = await addPage(db, pond, { title: 'Notes' })

    await actAs(db, USER)
    await expect(applyMove(db, moved, house, [moved], 'Notes 2')).rejects.toMatchObject({
      code: '23505',
    })
    await db.exec('reset role;')
    await db.close()
  })
})
