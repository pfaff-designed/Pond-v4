// Schema tests for 0027_page_trash.sql (KAN-97): the `deleted_at` column and
// partial sibling-title index, the split RLS policies, `trash_page`,
// `restore_page`, `pages_existing`, and the hardening added to each once a
// gap was found — a client can't insert or update its way around the RPCs,
// and the pond root / databases root can never be trashed at all.

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

async function lifePondId(db: PGlite, userId: string = USER): Promise<string> {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [userId]
  )
  return res.rows[0].id
}

/** A second pond for the SAME user — restore's sibling checks must not reach across ponds. */
async function addPond(db: PGlite, userId: string, order: number): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.ponds (user_id, name, glyph, theme, "order")
     values ($1, 'second pond', 'waves-02', 'paper', $2) returning id`,
    [userId, order]
  )
  return res.rows[0].id
}

async function addPage(
  db: PGlite,
  pondId: string,
  opts: {
    parentId?: string | null
    title?: string
    deletedAt?: string | null
    blocks?: unknown[]
  } = {}
): Promise<string> {
  const { parentId = null, title = 'Untitled', deletedAt = null, blocks = [] } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, pond_id, parent_id, type, title, deleted_at, blocks)
     values ($1, $2, $3, 'page', $4, $5, $6) returning id`,
    [USER, pondId, parentId, title, deletedAt, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

describe('0027_page_trash — the column', () => {
  it('is null by default', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const id = await addPage(db, pond, { title: 'a garden plan' })

    const res = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [id]
    )
    expect(res.rows[0].deleted_at).toBeNull()
    await db.close()
  })
})

describe('0027_page_trash — pages_sibling_title_pond_uniq goes partial', () => {
  it('lets a live sibling take the same title as an already-trashed page', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    await addPage(db, pond, { title: 'old quotes', deletedAt: new Date().toISOString() })
    await expect(addPage(db, pond, { title: 'old quotes' })).resolves.toBeDefined()
    await db.close()
  })

  it('still refuses two LIVE siblings with the same normalized title', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)

    await addPage(db, pond, { title: 'old quotes' })
    await expect(addPage(db, pond, { title: '  Old Quotes  ' })).rejects.toThrow(
      /pages_sibling_title_pond_uniq/
    )
    await db.close()
  })
})

describe('0027_page_trash — the pages RLS policies, split by verb', () => {
  it("hides a trashed row from its owner's own SELECT", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const trashedId = await addPage(db, pond, {
      title: 'old quotes',
      deletedAt: new Date().toISOString(),
    })
    const liveId = await addPage(db, pond, { title: 'a garden plan' })
    await actAs(db, USER)

    const res = await db.query<{ id: string }>('select id from public.pages')

    expect(res.rows.map((r) => r.id)).toEqual([liveId])
    expect(res.rows.map((r) => r.id)).not.toContain(trashedId)
    await db.exec('reset role;')
    await db.close()
  })

  it("affects 0 rows on a direct client UPDATE against a trashed row", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const trashedId = await addPage(db, pond, {
      title: 'old quotes',
      deletedAt: new Date().toISOString(),
    })
    await actAs(db, USER)

    const res = await db.query(`update public.pages set title = 'renamed' where id = $1`, [
      trashedId,
    ])
    expect(res.affectedRows ?? 0).toBe(0)

    await db.exec('reset role;')
    const check = await db.query<{ title: string }>(
      'select title from public.pages where id = $1',
      [trashedId]
    )
    expect(check.rows[0].title).toBe('old quotes')
    await db.close()
  })

  it('affects 0 rows on a direct client DELETE against a trashed row', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const trashedId = await addPage(db, pond, {
      title: 'old quotes',
      deletedAt: new Date().toISOString(),
    })
    await actAs(db, USER)

    const res = await db.query(`delete from public.pages where id = $1`, [trashedId])
    expect(res.affectedRows ?? 0).toBe(0)

    await db.exec('reset role;')
    const check = await db.query<{ id: string }>('select id from public.pages where id = $1', [
      trashedId,
    ])
    expect(check.rows).toHaveLength(1)
    await db.close()
  })

  it('leaves a live row selectable and updatable by its owner', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const liveId = await addPage(db, pond, { title: 'a garden plan' })
    await actAs(db, USER)

    const selected = await db.query<{ id: string }>(
      'select id from public.pages where id = $1',
      [liveId]
    )
    expect(selected.rows).toHaveLength(1)

    const updated = await db.query(`update public.pages set title = 'renamed' where id = $1`, [
      liveId,
    ])
    expect(updated.affectedRows).toBe(1)

    await db.exec('reset role;')
    await db.close()
  })

  it('refuses a client INSERT that arrives pre-trashed', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    await actAs(db, USER)

    await expect(
      db.query(
        `insert into public.pages (user_id, pond_id, parent_id, type, title, deleted_at, blocks)
         values ($1, $2, null, 'page', 'arrives trashed', now(), '[]')`,
        [USER, pond]
      )
    ).rejects.toThrow(/row-level security/)

    await db.exec('reset role;')
    await db.close()
  })

  it('refuses a client UPDATE that sets deleted_at on a live row', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const liveId = await addPage(db, pond, { title: 'a garden plan' })
    await actAs(db, USER)

    await expect(
      db.query(`update public.pages set deleted_at = now() where id = $1`, [liveId])
    ).rejects.toThrow(/row-level security/)

    await db.exec('reset role;')
    const check = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [liveId]
    )
    expect(check.rows[0].deleted_at).toBeNull()
    await db.close()
  })
})

describe('0027_page_trash — trash_page()', () => {
  it('stamps a subtree with one timestamp and logs one delete record', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const grandparent = await addPage(db, pond, { title: 'creativity' })
    const root = await addPage(db, pond, {
      parentId: grandparent,
      title: 'old quotes',
      blocks: [{ id: 'b1', type: 'text' }],
    })
    const child = await addPage(db, pond, {
      parentId: root,
      title: 'old quotes child',
      blocks: [{ id: 'b2', type: 'text' }, { id: 'b3', type: 'text' }],
    })
    await actAs(db, USER)

    await db.query('select public.trash_page($1)', [root])

    await db.exec('reset role;')
    const rows = await db.query<{ id: string; deleted_at: string | null }>(
      'select id, deleted_at from public.pages where id in ($1, $2)',
      [root, child]
    )
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows.every((r) => r.deleted_at !== null)).toBe(true)
    expect(rows.rows[0].deleted_at).toEqual(rows.rows[1].deleted_at)

    const log = await db.query<{
      action: string
      target_page_id: string
      before: {
        title: string
        parentId: string
        order: number
        pageIds: string[]
        blockCount: number
        nestedPageCount: number
        parentPath: string[]
      }
    }>('select action, target_page_id, before from public.change_log')
    expect(log.rows).toHaveLength(1)
    expect(log.rows[0].action).toBe('delete')
    expect(log.rows[0].target_page_id).toBe(root)
    expect(log.rows[0].before.title).toBe('old quotes')
    expect(log.rows[0].before.parentId).toBe(grandparent)
    expect(new Set(log.rows[0].before.pageIds)).toEqual(new Set([root, child]))
    expect(log.rows[0].before.blockCount).toBe(3)
    expect(log.rows[0].before.nestedPageCount).toBe(1)
    expect(log.rows[0].before.parentPath).toEqual(['creativity'])
    await db.close()
  })

  it('raises for a page that is not the caller\'s own', async () => {
    const db = await makeDb()
    const OTHER = '22222222-2222-2222-2222-222222222222'
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const pond = await lifePondId(db)
    const page = await addPage(db, pond, { title: 'someone else\'s page' })
    await actAs(db, OTHER)

    await expect(db.query('select public.trash_page($1)', [page])).rejects.toThrow(/not found/)

    await db.exec('reset role;')
    const check = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [page]
    )
    expect(check.rows[0].deleted_at).toBeNull()
    await db.close()
  })

  it('refuses to trash the pond root (type = home)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const home = await db.query<{ id: string }>(
      `insert into public.pages (user_id, pond_id, parent_id, type, title, blocks)
       values ($1, $2, null, 'home', 'life', '[]') returning id`,
      [USER, pond]
    )
    const homeId = home.rows[0].id
    await actAs(db, USER)

    await expect(db.query('select public.trash_page($1)', [homeId])).rejects.toThrow(
      /cannot be trashed/
    )

    await db.exec('reset role;')
    const check = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [homeId]
    )
    expect(check.rows[0].deleted_at).toBeNull()
    await db.close()
  })

  it('refuses to trash the databases root', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const databasesRoot = await addPage(db, pond, { title: 'databases' })
    await actAs(db, USER)

    await expect(db.query('select public.trash_page($1)', [databasesRoot])).rejects.toThrow(
      /cannot be trashed/
    )

    await db.exec('reset role;')
    const check = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [databasesRoot]
    )
    expect(check.rows[0].deleted_at).toBeNull()
    await db.close()
  })
})

async function deleteRecordFor(db: PGlite, rootId: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `select id from public.change_log where action = 'delete' and target_page_id = $1
     order by created_at desc limit 1`,
    [rootId]
  )
  return res.rows[0].id
}

describe('0027_page_trash — restore_page()', () => {
  it('restores to the exact original parent and order, a dense group left untouched', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parent = await addPage(db, pond, { title: 'creativity' })
    const a = await addPage(db, pond, { parentId: parent, title: 'a' })
    const root = await addPage(db, pond, { parentId: parent, title: 'old quotes' })
    const child = await addPage(db, pond, { parentId: root, title: 'old quotes child' })
    const c = await addPage(db, pond, { parentId: parent, title: 'c' })
    await db.query(`update public.pages set "order" = 0 where id = $1`, [a])
    await db.query(`update public.pages set "order" = 1 where id = $1`, [root])
    await db.query(`update public.pages set "order" = 2 where id = $1`, [c])

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const rows = await db.query<{
      id: string
      parent_id: string | null
      order: number
      deleted_at: string | null
    }>('select id, parent_id, "order", deleted_at from public.pages where id in ($1, $2, $3, $4)', [
      a,
      root,
      child,
      c,
    ])
    const byId = new Map(rows.rows.map((r) => [r.id, r]))
    // The slot root vacated at trash time was never closed (trashing never
    // renumbers the siblings it leaves behind), so restoring to order 1
    // reopens that exact slot without shifting a or c.
    expect(byId.get(a)?.order).toBe(0)
    expect(byId.get(root)?.parent_id).toBe(parent)
    expect(byId.get(root)?.order).toBe(1)
    expect(byId.get(root)?.deleted_at).toBeNull()
    expect(byId.get(child)?.deleted_at).toBeNull()
    expect(byId.get(c)?.order).toBe(2)

    const restoreLog = await db.query<{ action: string; after: { parentFallback: boolean } }>(
      `select action, after from public.change_log where action = 'restore' and target_page_id = $1`,
      [root]
    )
    expect(restoreLog.rows).toHaveLength(1)
    expect(restoreLog.rows[0].after.parentFallback).toBe(false)
    await db.close()
  })

  it('restores a tied sibling to its recorded order, leaving the other ties byte-identical', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parent = await addPage(db, pond, { title: 'creativity' })
    const a = await addPage(db, pond, { parentId: parent, title: 'a' })
    const b = await addPage(db, pond, { parentId: parent, title: 'b' })
    const c = await addPage(db, pond, { parentId: parent, title: 'c' })
    // All three tie at order 0, as new pages are created today
    // (src/lib/pages/client.ts) — the rail then sorts ties by title.

    const before = await db.query<{ id: string; order: number }>(
      'select id, "order" from public.pages where id in ($1, $2)',
      [a, c]
    )

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [b])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, b)

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const after = await db.query<{ id: string; title: string; order: number }>(
      'select id, title, "order" from public.pages where id in ($1, $2, $3) order by "order", lower(title)',
      [a, b, c]
    )
    expect(after.rows.map((r) => r.id)).toEqual([a, b, c])

    const bRow = after.rows.find((r) => r.id === b)
    expect(bRow?.order).toBe(0)
    const afterSiblings = new Map(after.rows.map((r) => [r.id, r.order]))
    const beforeSiblings = new Map(before.rows.map((r) => [r.id, r.order]))
    expect(afterSiblings.get(a)).toBe(beforeSiblings.get(a))
    expect(afterSiblings.get(c)).toBe(beforeSiblings.get(c))
    await db.close()
  })

  it('falls back to the pond root when the original parent is itself trashed', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parent = await addPage(db, pond, { title: 'creativity' })
    const root = await addPage(db, pond, { parentId: parent, title: 'old quotes' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [parent])
    await db.exec('reset role;')

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const restored = await db.query<{ parent_id: string | null; deleted_at: string | null }>(
      'select parent_id, deleted_at from public.pages where id = $1',
      [root]
    )
    expect(restored.rows[0].parent_id).toBeNull()
    expect(restored.rows[0].deleted_at).toBeNull()

    const restoreLog = await db.query<{ after: { parentFallback: boolean; parentId: string | null } }>(
      `select after from public.change_log where action = 'restore' and target_page_id = $1`,
      [root]
    )
    expect(restoreLog.rows[0].after.parentFallback).toBe(true)
    expect(restoreLog.rows[0].after.parentId).toBeNull()
    await db.close()
  })

  it('suffixes the title on a collision with a live sibling rather than refusing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parent = await addPage(db, pond, { title: 'creativity' })
    const root = await addPage(db, pond, { parentId: parent, title: 'old quotes' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)
    await addPage(db, pond, { parentId: parent, title: 'old quotes' })

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const restored = await db.query<{ title: string }>(
      'select title from public.pages where id = $1',
      [root]
    )
    expect(restored.rows[0].title).toBe('old quotes (restored)')
    await db.close()
  })

  it('leaves an independently-trashed child trashed when the parent is restored', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parent = await addPage(db, pond, { title: 'old quotes' })
    const child = await addPage(db, pond, { parentId: parent, title: 'old quotes child' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [child])
    await db.exec('reset role;')
    const childRecordId = await deleteRecordFor(db, child)

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [parent])
    await db.exec('reset role;')
    const parentRecordId = await deleteRecordFor(db, parent)

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [parentRecordId])
    await db.exec('reset role;')

    const rows = await db.query<{ id: string; deleted_at: string | null }>(
      'select id, deleted_at from public.pages where id in ($1, $2)',
      [parent, child]
    )
    const byId = new Map(rows.rows.map((r) => [r.id, r]))
    expect(byId.get(parent)?.deleted_at).toBeNull()
    expect(byId.get(child)?.deleted_at).not.toBeNull()

    await actAs(db, USER)
    await expect(db.query('select public.restore_page($1)', [childRecordId])).resolves.toBeDefined()
    await db.exec('reset role;')
    const afterChildRestore = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [child]
    )
    expect(afterChildRestore.rows[0].deleted_at).toBeNull()
    await db.close()
  })

  it('refuses to restore a record twice', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const root = await addPage(db, pond, { title: 'old quotes' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await expect(db.query('select public.restore_page($1)', [recordId])).rejects.toThrow(
      /not in trash/
    )
    await db.exec('reset role;')
    await db.close()
  })

  it('refuses a delete record with no recorded stamp rather than restoring nothing', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const root = await addPage(db, pond, { title: 'old quotes' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const realRecordId = await deleteRecordFor(db, root)

    // A second, malformed record for the same trashing, whose snapshot never
    // carried `deletedAt` — standing in for an older record shape. Inserted
    // fresh (not an UPDATE of the real one) since change_log's append-only
    // trigger only allows redacting `before` to null, not stripping one key.
    const malformed = await db.query<{ id: string }>(
      `insert into public.change_log
         (user_id, pond_id, status, action, actor, target_page_id, before, transitions, created_at, status_at)
       select user_id, pond_id, status, action, actor, target_page_id,
              before - 'deletedAt', transitions, created_at, status_at
         from public.change_log where id = $1
       returning id`,
      [realRecordId]
    )
    const malformedRecordId = malformed.rows[0].id

    await actAs(db, USER)
    await expect(db.query('select public.restore_page($1)', [malformedRecordId])).rejects.toThrow(
      /not in trash/
    )
    await db.exec('reset role;')

    const check = await db.query<{ deleted_at: string | null }>(
      'select deleted_at from public.pages where id = $1',
      [root]
    )
    expect(check.rows[0].deleted_at).not.toBeNull()
    await db.close()
  })
})

describe('0027_page_trash — restore_page() scopes siblings to the page\'s own pond', () => {
  it('does not let another pond\'s root page force a title suffix', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondA = await lifePondId(db)
    const pondB = await addPond(db, USER, 1)

    const a = await addPage(db, pondA, { title: 'a' })
    const root = await addPage(db, pondA, { title: 'old quotes' })
    const c = await addPage(db, pondA, { title: 'c' })
    await db.query(`update public.pages set "order" = 0 where id = $1`, [a])
    await db.query(`update public.pages set "order" = 1 where id = $1`, [root])
    await db.query(`update public.pages set "order" = 2 where id = $1`, [c])

    const otherSameTitle = await addPage(db, pondB, { title: 'old quotes' })
    const otherLater = await addPage(db, pondB, { title: 'z' })
    await db.query(`update public.pages set "order" = 5 where id = $1`, [otherSameTitle])
    await db.query(`update public.pages set "order" = 10 where id = $1`, [otherLater])

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const restored = await db.query<{ title: string; order: number }>(
      'select title, "order" from public.pages where id = $1',
      [root]
    )
    expect(restored.rows[0].title).toBe('old quotes')
    expect(restored.rows[0].order).toBe(1)

    const cRow = await db.query<{ order: number }>(
      'select "order" from public.pages where id = $1',
      [c]
    )
    // restore_page (0028) shifts nothing: c's own order is untouched by root's
    // restore into the now-reopened slot at 1.
    expect(cRow.rows[0].order).toBe(2)

    const pondBRows = await db.query<{ id: string; title: string; order: number }>(
      'select id, title, "order" from public.pages where id in ($1, $2)',
      [otherSameTitle, otherLater]
    )
    const byId = new Map(pondBRows.rows.map((r) => [r.id, r]))
    expect(byId.get(otherSameTitle)?.title).toBe('old quotes')
    expect(byId.get(otherSameTitle)?.order).toBe(5)
    expect(byId.get(otherLater)?.order).toBe(10)
    await db.close()
  })

  it('computes a parent-fallback order within the root page\'s own pond', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondA = await lifePondId(db)
    const pondB = await addPond(db, USER, 1)

    const a = await addPage(db, pondA, { title: 'a' })
    await db.query(`update public.pages set "order" = 5 where id = $1`, [a])
    const otherPondTall = await addPage(db, pondB, { title: 'tall stack' })
    await db.query(`update public.pages set "order" = 100 where id = $1`, [otherPondTall])

    const parent = await addPage(db, pondA, { title: 'creativity' })
    const root = await addPage(db, pondA, { parentId: parent, title: 'report' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [parent])
    await db.exec('reset role;')

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const restored = await db.query<{ parent_id: string | null; order: number }>(
      'select parent_id, "order" from public.pages where id = $1',
      [root]
    )
    expect(restored.rows[0].parent_id).toBeNull()
    expect(restored.rows[0].order).toBe(6)

    const untouched = await db.query<{ order: number }>(
      'select "order" from public.pages where id = $1',
      [otherPondTall]
    )
    expect(untouched.rows[0].order).toBe(100)
    await db.close()
  })

  it('loops past a second collision to a free "(restored N)" name', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const parent = await addPage(db, pond, { title: 'creativity' })
    const root = await addPage(db, pond, { parentId: parent, title: 'old quotes' })

    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    const recordId = await deleteRecordFor(db, root)

    await addPage(db, pond, { parentId: parent, title: 'old quotes' })
    await addPage(db, pond, { parentId: parent, title: 'old quotes (restored)' })

    await actAs(db, USER)
    await db.query('select public.restore_page($1)', [recordId])
    await db.exec('reset role;')

    const restored = await db.query<{ title: string }>(
      'select title from public.pages where id = $1',
      [root]
    )
    expect(restored.rows[0].title).toBe('old quotes (restored 2)')
    await db.close()
  })
})

describe('0027_page_trash — pages_existing()', () => {
  it('returns the id right after trash_page', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const root = await addPage(db, pond, { title: 'old quotes' })
    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])

    const res = await db.query<{ pages_existing: string[] }>('select public.pages_existing($1)', [
      [root],
    ])

    expect(res.rows[0].pages_existing).toEqual([root])
    await db.exec('reset role;')
    await db.close()
  })

  it('omits an id once the row is deleted directly, standing in for the purge job', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await lifePondId(db)
    const root = await addPage(db, pond, { title: 'old quotes' })
    await actAs(db, USER)
    await db.query('select public.trash_page($1)', [root])
    await db.exec('reset role;')
    await db.query('delete from public.pages where id = $1', [root])

    await actAs(db, USER)
    const res = await db.query<{ pages_existing: string[] }>('select public.pages_existing($1)', [
      [root],
    ])

    expect(res.rows[0].pages_existing).toEqual([])
    await db.exec('reset role;')
    await db.close()
  })

  it("does not return another user's page id", async () => {
    const db = await makeDb()
    const OTHER = '22222222-2222-2222-2222-222222222222'
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const otherPond = await lifePondId(db, OTHER)
    const otherRootRes = await db.query<{ id: string }>(
      `insert into public.pages (user_id, pond_id, parent_id, type, title, deleted_at, blocks)
       values ($1, $2, null, 'page', 'not yours', now(), '[]') returning id`,
      [OTHER, otherPond]
    )
    const otherRoot = otherRootRes.rows[0].id

    await actAs(db, USER)
    const res = await db.query<{ pages_existing: string[] }>('select public.pages_existing($1)', [
      [otherRoot],
    ])

    expect(res.rows[0].pages_existing).toEqual([])
    await db.exec('reset role;')
    await db.close()
  })
})
