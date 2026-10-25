// Schema tests for 0034_move_page_rename.sql (KAN-470): part A's
// `apply_page_move` gains an optional `p_new_title` that renames the moved
// page atomically with the reparent, and records both titles on the `move`
// record's before/after only when a rename actually happened. Part B's
// `undo_change_log_record` / `redo_change_log_record` restore/re-apply that
// title in the same single step they already restore/re-apply the parent.
// Part C widens `public.move_page` (the PostgREST-facing wrapper the client
// actually calls) to the same 4-arg shape — the "fix:" describe block below
// calls it the way PostgREST does, with named arguments, which is the only
// way the missing overload actually surfaced live.

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

const undo = (db: PGlite, ids: string[], pondId: string) =>
  db.query(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

const redo = (db: PGlite, ids: string[], pondId: string) =>
  db.query(`select * from public.redo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

const pageOf = async (db: PGlite, pageId: string) => {
  const res = await db.query<{ parent_id: string | null; title: string }>(
    'select parent_id, title from public.pages where id = $1',
    [pageId]
  )
  return res.rows[0]
}

/** A refusal: its SQLSTATE and the reason code the client reads off DETAIL. */
const refusal = (code: string, detail: string) => ({ code, detail })

describe('0034_move_page_rename — change_log_set_back restores/re-applies the title with the move', () => {
  it('undo restores the pre-move title and parent in the one RPC call', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { parentId: parentA, title: 'Notes' })

    await actAs(db, USER)
    await applyMove(db, moved, house, [moved], 'Notes 2')
    await db.exec('reset role;')
    const record = await lastMoveRecordFor(db, moved)

    await undo(db, [record.id], pond)

    expect(await pageOf(db, moved)).toEqual({ parent_id: parentA, title: 'Notes' })
    await db.close()
  })

  it('redo re-applies the suffixed title and the parent in the one RPC call', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { parentId: parentA, title: 'Notes' })

    await actAs(db, USER)
    await applyMove(db, moved, house, [moved], 'Notes 2')
    await db.exec('reset role;')
    const record = await lastMoveRecordFor(db, moved)

    await undo(db, [record.id], pond)
    await redo(db, [record.id], pond)

    expect(await pageOf(db, moved)).toEqual({ parent_id: house, title: 'Notes 2' })
    await db.close()
  })

  it('refuses page-changed to undo once the title has changed again in between, and changes nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { parentId: parentA, title: 'Notes' })

    await actAs(db, USER)
    await applyMove(db, moved, house, [moved], 'Notes 2')
    await db.exec('reset role;')
    const record = await lastMoveRecordFor(db, moved)

    await db.query('update public.pages set title = $1 where id = $2', ['Notes 2 renamed', moved])

    await expect(undo(db, [record.id], pond)).rejects.toMatchObject(
      refusal('P0001', 'page-changed')
    )
    expect(await pageOf(db, moved)).toEqual({ parent_id: house, title: 'Notes 2 renamed' })
    await db.close()
  })
})

describe('0034_move_page_rename — fix: public.move_page forwards p_new_title', () => {
  it('renames and moves atomically through PUBLIC.move_page called with named args, as PostgREST does', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { title: 'Notes' })

    await actAs(db, USER)
    await db.query(
      `select * from public.move_page(
         p_page_id := $1,
         p_new_parent_id := $2,
         p_sibling_order := $3,
         p_new_title := $4
       )`,
      [moved, house, [moved], 'Notes 2']
    )
    await db.exec('reset role;')

    expect(await pageOf(db, moved)).toEqual({ parent_id: house, title: 'Notes 2' })
    await db.close()
  })

  it('still resolves a 3-named-arg call with no ambiguous overload', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const house = await addPage(db, pond, { title: 'house' })
    const moved = await addPage(db, pond, { title: 'Notes' })

    await actAs(db, USER)
    await db.query(
      `select * from public.move_page(
         p_page_id := $1,
         p_new_parent_id := $2,
         p_sibling_order := $3
       )`,
      [moved, house, [moved]]
    )
    await db.exec('reset role;')

    expect(await pageOf(db, moved)).toEqual({ parent_id: house, title: 'Notes' })
    await db.close()
  })
})
