// Migration test for 0010_drop_area_type.sql (issue #108).
//
// Seam under test: the migration itself. The harness boots PGLite `through`
// 0009 — the last migration where `type = 'area'` is still legal — inserts a
// realistic pre-migration tree, then applies 0010 and asserts the conversion is
// lossless and the CHECK really narrowed. Nothing here touches application code:
// if the SQL is wrong, this fails.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, applyMigration, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'
const BEFORE = '0009_unique_sibling_title.sql'
const UNDER_TEST = '0010_drop_area_type.sql'

async function addPage(
  db: PGlite,
  opts: { parentId?: string | null; type?: string; title?: string; order?: number } = {}
): Promise<string> {
  const { parentId = null, type = 'page', title = 'Untitled', order = 0 } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, "order")
     values ($1, $2, $3, $4, $5) returning id`,
    [USER, parentId, type, title, order]
  )
  return res.rows[0].id
}

describe('0010_drop_area_type', () => {
  it('converts every area row to page with zero row loss, keeping parents and order', async () => {
    const db = await makeDb({ through: BEFORE })
    await seedUser(db, USER)

    // A realistic shape: two top-level areas, a nested area, leaf content, and a
    // page of every other surviving type so nothing else gets swept up.
    const health = await addPage(db, { type: 'area', title: 'Health', order: 2 })
    const personal = await addPage(db, { type: 'area', title: 'Personal', order: 0 })
    const food = await addPage(db, { parentId: personal, type: 'area', title: 'Food', order: 1 })
    const recipe = await addPage(db, { parentId: food, type: 'page', title: 'Lasagna', order: 0 })
    const project = await addPage(db, { parentId: health, type: 'project', title: 'Lose 40 lbs' })
    const routine = await addPage(db, { parentId: health, type: 'routine', title: '3-day' })
    const action = await addPage(db, { parentId: project, type: 'action', title: 'Weigh in' })

    const before = await db.query<{ n: number }>('select count(*)::int as n from public.pages')

    await applyMigration(db, UNDER_TEST)

    // Zero row loss.
    const after = await db.query<{ n: number }>('select count(*)::int as n from public.pages')
    expect(after.rows[0].n).toBe(before.rows[0].n)

    // No 'area' row survives anywhere.
    const areas = await db.query<{ n: number }>(
      `select count(*)::int as n from public.pages where type = 'area'`
    )
    expect(areas.rows[0].n).toBe(0)

    // The former areas are pages now — parent links and order intact, so their
    // area-ness (having children) is preserved for free.
    const rows = await db.query<{
      id: string
      parent_id: string | null
      type: string
      title: string
      order: number
    }>('select id, parent_id, type, title, "order" from public.pages order by title')
    const byId = new Map(rows.rows.map((r) => [r.id, r]))

    expect(byId.get(health)).toMatchObject({ type: 'page', parent_id: null, order: 2 })
    expect(byId.get(personal)).toMatchObject({ type: 'page', parent_id: null, order: 0 })
    expect(byId.get(food)).toMatchObject({ type: 'page', parent_id: personal, order: 1 })
    expect(byId.get(recipe)).toMatchObject({ type: 'page', parent_id: food, order: 0 })

    // Other type tags are untouched — only 'area' moved.
    expect(byId.get(project)!.type).toBe('project')
    expect(byId.get(routine)!.type).toBe('routine')
    expect(byId.get(action)!.type).toBe('action')

    await db.close()
  })

  it('narrows the type CHECK so no new area row can be written', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    await expect(addPage(db, { type: 'area', title: 'New area' })).rejects.toThrow(
      /pages_type_check/
    )

    // The surviving tags still insert cleanly, including the two reserved
    // technical values the UI never offers as a kind.
    for (const type of ['page', 'project', 'routine', 'action', 'row', 'home']) {
      await expect(addPage(db, { type, title: `A ${type}` })).resolves.toBeTruthy()
    }

    await db.close()
  })

  // The titles are LOWERCASE from 0017 on (#101 review): the rail renders a title
  // raw, and `Pond 05 Shell`'s rail copy is lowercase throughout — the capitals in
  // the boards are a `text-transform`. Pinned exactly, not case-insensitively:
  // the point is that what the seed WRITES is lowercase.
  // The seed RPCs are gone (0020). `seed_default_pages` filled five top-level
  // pages whenever the tree came back empty — which a NEW POND is, so it fought
  // #320's one-row-at-birth rule. A first pond's areas come from onboarding
  // (#171); a new pond's from `Pond 06.13` `s6m3`.
})
