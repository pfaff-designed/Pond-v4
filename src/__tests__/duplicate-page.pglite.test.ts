// Schema tests for 0032_duplicate_page.sql (KAN-468): `duplicate_page` copies
// a page's whole subtree (itself + every live descendant, any depth) in one
// atomic write, places the copy directly below the original, and logs exactly
// one accepted `duplicate_page` record whose undo reuses 0029's `page` kind —
// `trash_page` cascades the whole copy in one call.

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
  const { parentId = null, title = 'Untitled', order = 0, userId = USER, blocks = [] } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, "order", blocks)
     values ($1, $2, $3, 'page', $4, $5, $6) returning id`,
    [userId, pondId, parentId, title, order, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

const pageRow = async (db: PGlite, pageId: string) => {
  const res = await db.query<{
    id: string
    parent_id: string | null
    title: string
    order: number
    blocks: unknown[]
    deleted_at: string | null
  }>('select id, parent_id, title, "order", blocks, deleted_at from public.pages where id = $1', [
    pageId,
  ])
  return res.rows[0]
}

const childrenOf = async (db: PGlite, parentId: string | null, pondId: string) => {
  const res = await db.query<{ id: string; title: string; order: number }>(
    `select id, title, "order" from public.pages
      where coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce($1, '00000000-0000-0000-0000-000000000000'::uuid)
        and pond_id is not distinct from $2
        and deleted_at is null
      order by "order"`,
    [parentId, pondId]
  )
  return res.rows
}

interface DuplicateRecord {
  id: string
  status: string
  action: string
  target_page_id: string
  before: null
  after: { pageId: string }
}

const duplicateRecordFor = async (db: PGlite, newRootId: string): Promise<DuplicateRecord> => {
  const res = await db.query<DuplicateRecord>(
    `select id, status, action, target_page_id, before, after from public.change_log
      where action = 'duplicate_page' and target_page_id = $1`,
    [newRootId]
  )
  return res.rows[0]
}

describe('0032_duplicate_page — duplicate_page()', () => {
  it('copies the subtree (root + nested children, any depth), placing the copy directly below the original', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    const roof = await addPage(db, pond, { title: 'Recipes', order: 0 })
    const after = await addPage(db, pond, { title: 'after', order: 1 })
    const child = await addPage(db, pond, { parentId: roof, title: 'Soup', order: 0 })
    const grandchild = await addPage(db, pond, { parentId: child, title: 'Stock', order: 0 })

    await actAs(db, USER)
    const result = await db.query<DuplicateRecord>(
      `select * from public.duplicate_page($1, $2)`,
      [roof, 'Recipes 2']
    )
    await db.exec('reset role;')

    const record = result.rows[0]
    const newRootId = record.target_page_id
    expect(newRootId).not.toBe(roof)

    const newRoot = await pageRow(db, newRootId)
    expect(newRoot.title).toBe('Recipes 2')
    expect(newRoot.parent_id).toBeNull()
    expect(newRoot.order).toBe(1)

    // Directly below the original; `after`'s order shifted up by one to make room.
    const siblings = await childrenOf(db, null, pond)
    expect(siblings.map((s) => s.title)).toEqual(['Recipes', 'Recipes 2', 'after'])
    expect((await pageRow(db, after)).order).toBe(2)

    // The nested child and grandchild are copied too, under fresh copy parents,
    // every other row's title kept verbatim (no dedup needed below the root).
    const newChildren = await childrenOf(db, newRootId, pond)
    expect(newChildren).toHaveLength(1)
    expect(newChildren[0].title).toBe('Soup')
    expect(newChildren[0].id).not.toBe(child)

    const newGrandchildren = await childrenOf(db, newChildren[0].id, pond)
    expect(newGrandchildren).toHaveLength(1)
    expect(newGrandchildren[0].title).toBe('Stock')
    expect(newGrandchildren[0].id).not.toBe(grandchild)

    // The original subtree is untouched.
    expect((await pageRow(db, roof)).title).toBe('Recipes')
    expect((await childrenOf(db, roof, pond)).map((c) => c.id)).toEqual([child])
    expect((await childrenOf(db, child, pond)).map((c) => c.id)).toEqual([grandchild])

    await db.close()
  })

  it('logs exactly one accepted duplicate_page record, before null and after carrying the new root id', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const roof = await addPage(db, pond, { title: 'Recipes' })

    await actAs(db, USER)
    const result = await db.query<DuplicateRecord>(
      `select * from public.duplicate_page($1, $2)`,
      [roof, 'Recipes 2']
    )
    await db.exec('reset role;')

    const newRootId = result.rows[0].target_page_id
    const record = await duplicateRecordFor(db, newRootId)
    expect(record.status).toBe('accepted')
    expect(record.before).toBeNull()
    expect(record.after).toEqual({ pageId: newRootId })

    await db.close()
  })

  it('copies a view block verbatim — the view, not the database it points at', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const database = await addPage(db, pond, { title: 'Tasks' })
    const viewBlock = {
      id: 'block-1',
      type: 'view',
      collectionId: database,
      mode: 'table',
    }
    const roof = await addPage(db, pond, { title: 'Dashboard', blocks: [viewBlock] })

    await actAs(db, USER)
    const result = await db.query<DuplicateRecord>(
      `select * from public.duplicate_page($1, $2)`,
      [roof, 'Dashboard 2']
    )
    await db.exec('reset role;')

    const newRoot = await pageRow(db, result.rows[0].target_page_id)
    expect(newRoot.blocks).toEqual([viewBlock])
    // The database itself was never duplicated.
    const databaseRows = await db.query<{ n: number }>(
      `select count(*)::int as n from public.pages where title = 'Tasks'`
    )
    expect(databaseRows.rows[0].n).toBe(1)

    await db.close()
  })

  it('rewrites an internal page-link to the copied descendant, and leaves an external page-link untouched', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const outside = await addPage(db, pond, { title: 'Outside' })
    const roof = await addPage(db, pond, { title: 'Recipes' })
    const child = await addPage(db, pond, { parentId: roof, title: 'Soup' })
    await db.query(
      `update public.pages set blocks = $1 where id = $2`,
      [
        JSON.stringify([
          { id: 'link-internal', type: 'page-link', pageId: child },
          { id: 'link-external', type: 'page-link', pageId: outside },
        ]),
        roof,
      ]
    )

    await actAs(db, USER)
    const result = await db.query<DuplicateRecord>(
      `select * from public.duplicate_page($1, $2)`,
      [roof, 'Recipes 2']
    )
    await db.exec('reset role;')

    const newRootId = result.rows[0].target_page_id
    const newRoot = await pageRow(db, newRootId)
    const newChild = (await childrenOf(db, newRootId, pond))[0]
    const blocks = newRoot.blocks as { id: string; type: string; pageId: string }[]

    const internal = blocks.find((b) => b.id === 'link-internal')
    expect(internal?.pageId).toBe(newChild.id)
    const external = blocks.find((b) => b.id === 'link-external')
    expect(external?.pageId).toBe(outside)

    await db.close()
  })

  it("raises not-found for another user's page, writing nothing", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const pond = await lifePondId(db)
    const roof = await addPage(db, pond, { title: 'Recipes' })

    await actAs(db, OTHER)
    await expect(
      db.query(`select public.duplicate_page($1, $2)`, [roof, 'Recipes 2'])
    ).rejects.toMatchObject({ code: 'P0002', detail: 'not-found' })
    await db.exec('reset role;')

    const siblings = await childrenOf(db, null, pond)
    expect(siblings.map((s) => s.title)).toEqual(['Recipes'])
    const log = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
    expect(log.rows[0].n).toBe(0)

    await db.close()
  })

  it('raises not-found for a trashed page, writing nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const roof = await addPage(db, pond, { title: 'Recipes' })
    await db.query('update public.pages set deleted_at = now() where id = $1', [roof])

    await actAs(db, USER)
    await expect(
      db.query(`select public.duplicate_page($1, $2)`, [roof, 'Recipes 2'])
    ).rejects.toMatchObject({ code: 'P0002', detail: 'not-found' })
    await db.exec('reset role;')

    const log = await db.query<{ n: number }>('select count(*)::int as n from public.change_log')
    expect(log.rows[0].n).toBe(0)

    await db.close()
  })
})

const undo = (db: PGlite, ids: string[], pondId: string) =>
  db.query(`select * from public.undo_change_log_record($1::uuid[], $2, 'you')`, [ids, pondId])

describe('0032_duplicate_page — undo reuses the `page` kind, cascading the whole copy away', () => {
  it('undoing a duplicate trashes the copy and every descendant it copied, in one call', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const roof = await addPage(db, pond, { title: 'Recipes' })
    const child = await addPage(db, pond, { parentId: roof, title: 'Soup' })

    await actAs(db, USER)
    const result = await db.query<DuplicateRecord>(
      `select * from public.duplicate_page($1, $2)`,
      [roof, 'Recipes 2']
    )
    await db.exec('reset role;')

    const newRootId = result.rows[0].target_page_id
    const record = await duplicateRecordFor(db, newRootId)
    const newChild = (await childrenOf(db, newRootId, pond))[0]

    await undo(db, [record.id], pond)

    expect((await pageRow(db, newRootId)).deleted_at).not.toBeNull()
    expect((await pageRow(db, newChild.id)).deleted_at).not.toBeNull()
    // The original subtree is untouched by the undo.
    expect((await pageRow(db, roof)).deleted_at).toBeNull()
    expect((await pageRow(db, child)).deleted_at).toBeNull()

    await db.close()
  })
})
