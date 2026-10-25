// Schema tests for 0031_move_page_links.sql parts A and B (KAN-467):
// `move_page` strips the moved page's own `page-link` block off its old
// parent's (or the pond's home row's) `blocks`, recording the removed block
// and its index on the `move` record's `before.removedLink` (part A), and
// appends one onto the new parent's (or home row's) `blocks`, unless one is
// already there, recording the appended block's id on `after.appendedLinkId`
// (part B) — a page moved into a new parent still shows up where it used to
// live, and doesn't show up where it moved to, until this runs.

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
  opts: {
    parentId?: string | null
    title?: string
    order?: number
    userId?: string
    blocks?: unknown[]
  } = {}
): Promise<string> => {
  const { parentId = null, title = 'Untitled', order = 0, userId = USER, blocks } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, "order", blocks)
     values ($1, $2, $3, 'page', $4, $5, $6)
     returning id`,
    [userId, pondId, parentId, title, order, JSON.stringify(blocks ?? [])]
  )
  return res.rows[0].id
}

const pageLink = (pageId: string, id = `link-${pageId}`) => ({ id, type: 'page-link', pageId })

const blocksOf = async (db: PGlite, pageId: string): Promise<unknown[]> => {
  const res = await db.query<{ blocks: unknown[] }>(
    'select blocks from public.pages where id = $1',
    [pageId]
  )
  return res.rows[0].blocks
}

interface MoveRecord {
  before: { removedLink?: { block: unknown; index: number } }
  after: { appendedLinkId?: string }
}

const lastMoveRecordFor = async (db: PGlite, pageId: string): Promise<MoveRecord> => {
  const res = await db.query<MoveRecord>(
    `select before, after from public.change_log
      where action = 'move' and target_page_id = $1
      order by created_at desc
      limit 1`,
    [pageId]
  )
  return res.rows[0]
}

describe('0031_move_page_links — apply_page_move strips the old parent\'s link (part A)', () => {
  it("removes the moved page's own link from its old parent, at its recorded index", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const child = await addPage(db, pond, { parentId: parentA, title: 'child' })
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify([{ id: 'before', type: 'text', value: 'x' }, pageLink(child), {
        id: 'after',
        type: 'text',
        value: 'y',
      }]),
      parentA,
    ])

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, parentB, [child]])
    await db.exec('reset role;')

    const remaining = await blocksOf(db, parentA)
    expect(remaining).toEqual([
      { id: 'before', type: 'text', value: 'x' },
      { id: 'after', type: 'text', value: 'y' },
    ])

    const record = await lastMoveRecordFor(db, child)
    expect(record.before.removedLink).toEqual({ block: pageLink(child), index: 1 })
    await db.close()
  })

  it("removes a top-level page's link from the pond's home row", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const home = await db
      .query<{ id: string }>(
        `insert into public.pages (user_id, pond_id, parent_id, type, title, blocks)
         values ($1, $2, null, 'home', 'life', '[]')
         returning id`,
        [USER, pond]
      )
      .then((res) => res.rows[0].id)
    const other = await addPage(db, pond, { title: 'other' })
    const child = await addPage(db, pond, { title: 'child' })
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify([pageLink(child)]),
      home,
    ])

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, other, [child]])
    await db.exec('reset role;')

    expect(await blocksOf(db, home)).toEqual([])
    const record = await lastMoveRecordFor(db, child)
    expect(record.before.removedLink).toEqual({ block: pageLink(child), index: 0 })
    await db.close()
  })

  it('records no removedLink when the old parent carries no link to the moved page', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const child = await addPage(db, pond, { parentId: parentA, title: 'child' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, parentB, [child]])
    await db.exec('reset role;')

    const record = await lastMoveRecordFor(db, child)
    expect(record.before.removedLink).toBeUndefined()
    await db.close()
  })

  it("leaves a different page's /link-to-page link to the moved page untouched", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const child = await addPage(db, pond, { parentId: parentA, title: 'child' })
    const third = await addPage(db, pond, {
      title: 'third',
      blocks: [pageLink(child, 'manual-link')],
    })
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify([pageLink(child)]),
      parentA,
    ])

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, parentB, [child]])
    await db.exec('reset role;')

    expect(await blocksOf(db, third)).toEqual([pageLink(child, 'manual-link')])
    expect(await blocksOf(db, parentA)).toEqual([])
    await db.close()
  })
})

describe("0031_move_page_links — apply_page_move appends the moved page's link to the new parent (part B)", () => {
  it("appends a page-link block for the moved page onto the new parent's blocks", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, {
      title: 'parent b',
      blocks: [{ id: 'before', type: 'text', value: 'x' }],
    })
    const child = await addPage(db, pond, { parentId: parentA, title: 'child' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, parentB, [child]])
    await db.exec('reset role;')

    const record = await lastMoveRecordFor(db, child)
    expect(record.after.appendedLinkId).toEqual(expect.any(String))
    expect(await blocksOf(db, parentB)).toEqual([
      { id: 'before', type: 'text', value: 'x' },
      pageLink(child, record.after.appendedLinkId),
    ])
    await db.close()
  })

  it("appends a top-level page's link onto the pond's home row", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const home = await db
      .query<{ id: string }>(
        `insert into public.pages (user_id, pond_id, parent_id, type, title, blocks)
         values ($1, $2, null, 'home', 'life', '[]')
         returning id`,
        [USER, pond]
      )
      .then((res) => res.rows[0].id)
    const other = await addPage(db, pond, { title: 'other' })
    const child = await addPage(db, pond, { parentId: other, title: 'child' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, null, [child]])
    await db.exec('reset role;')

    const record = await lastMoveRecordFor(db, child)
    expect(record.after.appendedLinkId).toEqual(expect.any(String))
    expect(await blocksOf(db, home)).toEqual([pageLink(child, record.after.appendedLinkId)])
    await db.close()
  })

  it("does not duplicate the link when the new parent already carries one", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const child = await addPage(db, pond, { parentId: parentA, title: 'child' })
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify([pageLink(child, 'already-there')]),
      parentB,
    ])

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [child, parentB, [child]])
    await db.exec('reset role;')

    expect(await blocksOf(db, parentB)).toEqual([pageLink(child, 'already-there')])
    const record = await lastMoveRecordFor(db, child)
    expect(record.after.appendedLinkId).toBeUndefined()
    await db.close()
  })

  it('changes no link rows on a same-parent reorder', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const childOne = await addPage(db, pond, { parentId: parentA, title: 'one', order: 0 })
    const childTwo = await addPage(db, pond, { parentId: parentA, title: 'two', order: 1 })
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify([pageLink(childOne)]),
      parentA,
    ])

    await actAs(db, USER)
    // Reorder childTwo ahead of childOne, within the same parent.
    await db.query('select public.move_page($1, $2, $3)', [
      childTwo,
      parentA,
      [childTwo, childOne],
    ])
    await db.exec('reset role;')

    expect(await blocksOf(db, parentA)).toEqual([pageLink(childOne)])
    const record = await lastMoveRecordFor(db, childTwo)
    expect(record.before.removedLink).toBeUndefined()
    expect(record.after.appendedLinkId).toBeUndefined()
    await db.close()
  })
})
