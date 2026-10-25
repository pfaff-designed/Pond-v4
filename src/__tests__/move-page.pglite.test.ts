// Schema tests for 0030_move_page.sql (KAN-466 part 1): `move_page` reparents
// a page, densely reindexes the destination sibling group, and logs exactly
// one accepted `move` record in a single atomic write — replacing
// `movePage`'s old two-step client write (parent_id, then a `Promise.all` of
// per-row order updates). Every refusal is checked for its reason code and
// for leaving the page, its order and the log exactly as they were.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

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

const addPond = async (db: PGlite, userId: string): Promise<string> => {
  const res = await db.query<{ id: string }>(
    `insert into public.ponds (user_id, name, "order") values ($1, 'other pond', 1) returning id`,
    [userId]
  )
  return res.rows[0].id
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

interface MoveRecord {
  id: string
  status: string
  action: string
  before: { parentId: string | null; parentTitle: string; siblingOrder: string[] }
  after: { parentId: string | null; parentTitle: string; siblingOrder: string[] }
}

const moveRecordsFor = async (db: PGlite, pageId: string): Promise<MoveRecord[]> => {
  const res = await db.query<MoveRecord>(
    `select id, status, action, before, after from public.change_log
      where action = 'move' and target_page_id = $1
      order by created_at asc`,
    [pageId]
  )
  return res.rows
}

describe('0030_move_page — move_page()', () => {
  it('reparents the page, densely reindexes the destination group, and logs exactly one accepted move record', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof', order: 0 })
    const a = await addPage(db, pond, { parentId: parentA, title: 'a', order: 1 })
    const b = await addPage(db, pond, { parentId: parentA, title: 'b', order: 2 })
    const x = await addPage(db, pond, { parentId: parentB, title: 'x', order: 0 })
    const y = await addPage(db, pond, { parentId: parentB, title: 'y', order: 1 })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentB, [x, roof, y]])
    await db.exec('reset role;')

    const moved = await db.query<{ parent_id: string; order: number }>(
      'select parent_id, "order" from public.pages where id = $1',
      [roof]
    )
    expect(moved.rows[0].parent_id).toBe(parentB)
    expect(moved.rows[0].order).toBe(1)

    const destination = await db.query<{ id: string; order: number }>(
      'select id, "order" from public.pages where id in ($1, $2, $3) order by "order"',
      [x, roof, y]
    )
    expect(destination.rows.map((r) => r.id)).toEqual([x, roof, y])
    expect(destination.rows.map((r) => r.order)).toEqual([0, 1, 2])

    // The old group is a snapshot, not a rewrite: nothing left behind moves.
    const left = await db.query<{ id: string; order: number }>(
      'select id, "order" from public.pages where id in ($1, $2) order by "order"',
      [a, b]
    )
    expect(left.rows.map((r) => r.order)).toEqual([1, 2])

    const records = await moveRecordsFor(db, roof)
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('accepted')
    expect(records[0].before).toEqual({
      parentId: parentA,
      parentTitle: 'parent a',
      siblingOrder: [roof, a, b],
    })
    // parentB's `blocks` carries no link to `roof` yet, so the move (0031
    // part B) appends one and records its id here.
    expect(records[0].after).toEqual({
      parentId: parentB,
      parentTitle: 'parent b',
      siblingOrder: [x, roof, y],
      appendedLinkId: expect.any(String),
    })
    await db.close()
  })

  it("resolves a null destination parent to the pond's home page title", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    await db.query(
      `insert into public.pages (user_id, pond_id, parent_id, type, title, blocks)
       values ($1, $2, null, 'home', 'life', '[]')`,
      [USER, pond]
    )
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, null, [roof]])
    await db.exec('reset role;')

    const records = await moveRecordsFor(db, roof)
    expect(records[0].after.parentId).toBeNull()
    expect(records[0].after.parentTitle).toBe('life')
    await db.close()
  })
})

describe('0030_move_page — move_page() refuses what it cannot see', () => {
  it("raises not-found for another user's page, writing nothing", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })

    await actAs(db, OTHER)
    await expect(
      db.query('select public.move_page($1, $2, $3)', [roof, null, [roof]])
    ).rejects.toMatchObject({ code: 'P0002', detail: 'not-found' })
    await db.exec('reset role;')

    const check = await db.query<{ parent_id: string | null }>(
      'select parent_id from public.pages where id = $1',
      [roof]
    )
    expect(check.rows[0].parent_id).toBe(parentA)
    expect(await moveRecordsFor(db, roof)).toHaveLength(0)
    await db.close()
  })

  it('raises not-found for a page id that does not exist, writing nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await actAs(db, USER)

    const bogus = '99999999-9999-9999-9999-999999999999'
    await expect(
      db.query('select public.move_page($1, $2, $3)', [bogus, null, [bogus]])
    ).rejects.toMatchObject({ code: 'P0002', detail: 'not-found' })
    await db.exec('reset role;')

    const log = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
    expect(log.rows[0].n).toBe(0)
    await db.close()
  })
})

describe('0030_move_page — a sibling order missing the moved page leaves nothing half-applied', () => {
  it('raises invalid_parameter_value and leaves parent_id, order and the log untouched', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof', order: 0 })
    const x = await addPage(db, pond, { parentId: parentB, title: 'x', order: 0 })

    await actAs(db, USER)
    await expect(
      // Deliberately omits `roof` itself from the sibling order — the
      // mid-write failure that must leave the earlier parent_id UPDATE
      // rolled back along with it (see the migration header).
      db.query('select public.move_page($1, $2, $3)', [roof, parentB, [x]])
    ).rejects.toMatchObject({ code: '22023', detail: 'invalid-sibling-order' })
    await db.exec('reset role;')

    const check = await db.query<{ parent_id: string; order: number }>(
      'select parent_id, "order" from public.pages where id = $1',
      [roof]
    )
    expect(check.rows[0].parent_id).toBe(parentA)
    expect(check.rows[0].order).toBe(0)

    const xRow = await db.query<{ order: number }>(
      'select "order" from public.pages where id = $1',
      [x]
    )
    expect(xRow.rows[0].order).toBe(0)

    expect(await moveRecordsFor(db, roof)).toHaveLength(0)
    await db.close()
  })
})

const undo = (db: PGlite, ids: string[], pondId: string) =>
  db.query(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

const redo = (db: PGlite, ids: string[], pondId: string) =>
  db.query(`select * from public.redo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

const pageOf = async (db: PGlite, pageId: string) => {
  const res = await db.query<{ parent_id: string | null; order: number }>(
    'select parent_id, "order" from public.pages where id = $1',
    [pageId]
  )
  return res.rows[0]
}

/** A refusal: its SQLSTATE and the reason code the client reads off DETAIL. */
const refusal = (code: string, detail: string) => ({ code, detail })

describe('0030_move_page — undo_change_log_record / redo_change_log_record on a move', () => {
  it("restores parent_id and the exact old sibling order, leaving the untouched siblings as they were", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof', order: 0 })
    const a = await addPage(db, pond, { parentId: parentA, title: 'a', order: 1 })
    const b = await addPage(db, pond, { parentId: parentA, title: 'b', order: 2 })
    const x = await addPage(db, pond, { parentId: parentB, title: 'x', order: 0 })
    const y = await addPage(db, pond, { parentId: parentB, title: 'y', order: 1 })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentB, [x, roof, y]])
    await db.exec('reset role;')
    const record = (await moveRecordsFor(db, roof))[0]

    await undo(db, [record.id], pond)

    expect(await pageOf(db, roof)).toEqual({ parent_id: parentA, order: 0 })
    expect(await pageOf(db, a)).toEqual({ parent_id: parentA, order: 1 })
    expect(await pageOf(db, b)).toEqual({ parent_id: parentA, order: 2 })
    await db.close()
  })

  it('redo re-applies the move', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof', order: 0 })
    const x = await addPage(db, pond, { parentId: parentB, title: 'x', order: 0 })
    const y = await addPage(db, pond, { parentId: parentB, title: 'y', order: 1 })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentB, [x, roof, y]])
    await db.exec('reset role;')
    const record = (await moveRecordsFor(db, roof))[0]

    await undo(db, [record.id], pond)
    await redo(db, [record.id], pond)

    expect(await pageOf(db, roof)).toEqual({ parent_id: parentB, order: 1 })
    expect(await pageOf(db, x)).toEqual({ parent_id: parentB, order: 0 })
    expect(await pageOf(db, y)).toEqual({ parent_id: parentB, order: 2 })
    await db.close()
  })

  it('refuses to undo the same move record twice', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentB, [roof]])
    await db.exec('reset role;')
    const record = (await moveRecordsFor(db, roof))[0]

    await undo(db, [record.id], pond)

    await expect(undo(db, [record.id], pond)).rejects.toMatchObject(
      refusal('22023', 'already-undone')
    )
    expect(await pageOf(db, roof)).toEqual({ parent_id: parentA, order: 0 })
    await db.close()
  })

  it('refuses to undo a move once a later, unrelated move has changed the page, and changes nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const parentC = await addPage(db, pond, { title: 'parent c' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentB, [roof]])
    await db.exec('reset role;')
    const firstMove = (await moveRecordsFor(db, roof))[0]

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentC, [roof]])
    await db.exec('reset role;')

    await expect(undo(db, [firstMove.id], pond)).rejects.toMatchObject(
      refusal('P0001', 'page-changed')
    )
    expect(await pageOf(db, roof)).toEqual({ parent_id: parentC, order: 0 })
    await db.close()
  })
})

describe('0030_move_page — move_page() guards parentage (KAN-466 fix)', () => {
  it('raises not-found for a trashed page, writing nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })
    await db.query('update public.pages set deleted_at = now() where id = $1', [roof])

    await actAs(db, USER)
    await expect(
      db.query('select public.move_page($1, $2, $3)', [roof, parentB, [roof]])
    ).rejects.toMatchObject(refusal('P0002', 'not-found'))
    await db.exec('reset role;')

    const check = await db.query<{ parent_id: string | null }>(
      'select parent_id from public.pages where id = $1',
      [roof]
    )
    expect(check.rows[0].parent_id).toBe(parentA)
    expect(await moveRecordsFor(db, roof)).toHaveLength(0)
    await db.close()
  })

  it('raises invalid_parameter_value for a parent that is its own descendant, writing nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const roof = await addPage(db, pond, { title: 'roof' })
    const child = await addPage(db, pond, { parentId: roof, title: 'child' })

    await actAs(db, USER)
    await expect(
      db.query('select public.move_page($1, $2, $3)', [roof, child, [roof]])
    ).rejects.toMatchObject(refusal('22023', 'invalid-new-parent'))
    await db.exec('reset role;')

    const check = await db.query<{ parent_id: string | null }>(
      'select parent_id from public.pages where id = $1',
      [roof]
    )
    expect(check.rows[0].parent_id).toBeNull()
    expect(await moveRecordsFor(db, roof)).toHaveLength(0)
    await db.close()
  })

  it('raises not-found for a parent in another pond, writing nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const otherPond = await addPond(db, USER)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })
    const otherPondPage = await addPage(db, otherPond, { title: 'elsewhere' })

    await actAs(db, USER)
    await expect(
      db.query('select public.move_page($1, $2, $3)', [roof, otherPondPage, [roof]])
    ).rejects.toMatchObject(refusal('P0002', 'not-found'))
    await db.exec('reset role;')

    const check = await db.query<{ parent_id: string | null }>(
      'select parent_id from public.pages where id = $1',
      [roof]
    )
    expect(check.rows[0].parent_id).toBe(parentA)
    expect(await moveRecordsFor(db, roof)).toHaveLength(0)
    await db.close()
  })

  it('raises not-found for a trashed parent, writing nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })
    await db.query('update public.pages set deleted_at = now() where id = $1', [parentB])

    await actAs(db, USER)
    await expect(
      db.query('select public.move_page($1, $2, $3)', [roof, parentB, [roof]])
    ).rejects.toMatchObject(refusal('P0002', 'not-found'))
    await db.exec('reset role;')

    const check = await db.query<{ parent_id: string | null }>(
      'select parent_id from public.pages where id = $1',
      [roof]
    )
    expect(check.rows[0].parent_id).toBe(parentA)
    expect(await moveRecordsFor(db, roof)).toHaveLength(0)
    await db.close()
  })
})

describe('0030_move_page — undo refuses a restore parent that is gone (KAN-466 fix)', () => {
  it('refuses page-gone to undo a move once the old parent has been trashed, and changes nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const parentB = await addPage(db, pond, { title: 'parent b' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })

    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, parentB, [roof]])
    await db.exec('reset role;')
    const record = (await moveRecordsFor(db, roof))[0]

    await db.query('update public.pages set deleted_at = now() where id = $1', [parentA])

    await expect(undo(db, [record.id], pond)).rejects.toMatchObject(
      refusal('P0002', 'page-gone')
    )
    expect(await pageOf(db, roof)).toEqual({ parent_id: parentB, order: 0 })
    await db.close()
  })
})

describe('0030_move_page — undo refuses a cycle a second, unrelated move has set up (KAN-466 fix)', () => {
  it("refuses page-changed when the restore parent now sits in the moved page's own subtree, and changes nothing", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const house = await addPage(db, pond, { title: 'house' })
    const a = await addPage(db, pond, { title: 'a' })
    const roof = await addPage(db, pond, { parentId: a, title: 'roof' })

    // Tab 1: drag roof (under a) onto house.
    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [roof, house, [roof]])
    await db.exec('reset role;')
    const roofMove = (await moveRecordsFor(db, roof))[0]

    // Tab 2: drag a under roof. Roof's subtree is now { roof, a }.
    await actAs(db, USER)
    await db.query('select public.move_page($1, $2, $3)', [a, roof, [a]])
    await db.exec('reset role;')

    // Tab 1: press undo on the first move. Restoring roof's parent to `a`
    // would nest roof under its own descendant — a cycle the simple
    // parent_id compare alone (current parent is still `house`) does not
    // catch.
    await expect(undo(db, [roofMove.id], pond)).rejects.toMatchObject(
      refusal('P0001', 'page-changed')
    )
    expect(await pageOf(db, roof)).toEqual({ parent_id: house, order: 0 })
    expect(await pageOf(db, a)).toEqual({ parent_id: roof, order: 0 })
    await db.close()
  })
})

describe('0030_move_page — a pre-existing cycle in the data terminates instead of hanging (KAN-466 fix)', () => {
  it('reparents past a cycle written directly into the table instead of looping forever', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const dest = await addPage(db, pond, { title: 'dest' })
    const p1 = await addPage(db, pond, { title: 'p1' })
    const p2 = await addPage(db, pond, { parentId: p1, title: 'p2' })
    // A cycle written directly, bypassing move_page/apply_page_move entirely —
    // the only way the schema's FK/trigger layer can't itself prevent one.
    // p1 -> p2 -> p1: dest is outside the cycle, so the subtree walk rooted
    // at p1 must exhaust the whole cycle (bouncing between p1 and p2) before
    // it can correctly conclude dest isn't in it — it bounces forever unless
    // it de-duplicates visited ids.
    await db.query('update public.pages set parent_id = $1 where id = $2', [p2, p1])

    // Guard: if the `union all` cycle walk ever regresses, this statement
    // hits the timeout (and the call rejects) instead of hanging the whole
    // test run.
    await db.exec(`set statement_timeout = '3s';`)
    await actAs(db, USER)
    await expect(
      db.query('select public.move_page($1, $2, $3)', [p1, dest, [p1]])
    ).resolves.toBeDefined()
    await db.exec('reset role; reset statement_timeout;')

    expect(await pageOf(db, p1)).toEqual({ parent_id: dest, order: 0 })
    await db.close()
  }, 15000)
})

describe('0030_move_page — private.page_is_self_or_descendant is scoped to the caller, not a parameter (KAN-466 fix)', () => {
  it("as another user, never reports user A's own page as a descendant of another of user A's pages", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const pond = await lifePondId(db)
    const parentA = await addPage(db, pond, { title: 'parent a' })
    const roof = await addPage(db, pond, { parentId: parentA, title: 'roof' })

    // `roof` really is a descendant of `parentA`, for user A. If this helper
    // still took `p_user_id` as a parameter, user B could pass user A's id
    // and the `security definer` walk would report `true`, revealing user
    // A's tree shape to a user who owns neither page. Scoped to `auth.uid()`
    // instead, user B's own call can only ever see user B's subtree.
    await actAs(db, OTHER)
    const result = await db.query<{ result: boolean }>(
      'select private.page_is_self_or_descendant($1, $2) as result',
      [parentA, roof]
    )
    await db.exec('reset role;')

    expect(result.rows[0].result).toBe(false)
    await db.close()
  })
})
