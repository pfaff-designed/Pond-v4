// Proves use-block-count's query shape (lib/modules/page-link/use-block-count.ts)
// against a real `pages.blocks` column (KAN-122): selecting `blocks` for a
// seeded page and measuring `.length` returns the live count, not a stored
// mirror. Raw SQL stands in for the hook's one supabase-js select (no
// supabase-js/PGLite bridge in this repo, same as every other pglite test
// here), but the count itself is the real production `blockCount`.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'
import { blockCount } from '@/lib/modules/page-link/use-block-count'

const USER = '11111111-1111-1111-1111-111111111111'

function makeBlocks(n: number): { id: string; type: 'text'; content: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: `b-${i}`, type: 'text', content: `line ${i}` }))
}

async function addPage(db: PGlite, blocks: unknown[]): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, blocks)
     values ($1, null, 'page', 'cabinets', $2) returning id`,
    [USER, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

/** The exact select the hook's `queryFn` performs, against the real column. */
async function selectBlocks(db: PGlite, id: string): Promise<unknown> {
  const res = await db.query<{ blocks: unknown }>('select blocks from public.pages where id = $1', [
    id,
  ])
  return res.rows[0].blocks
}

describe('page-link N blocks — live count off the real blocks column', () => {
  it('returns the seeded block count', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db, makeBlocks(3))

    expect(blockCount(await selectBlocks(db, id))).toBe(3)
    await db.close()
  })

  it('is empty for a page with no blocks', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db, [])

    expect(blockCount(await selectBlocks(db, id))).toBe(0)
    await db.close()
  })

  it('reflects a changed block count on re-read, not a stale value', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db, makeBlocks(1))
    expect(blockCount(await selectBlocks(db, id))).toBe(1)

    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify(makeBlocks(4)),
      id,
    ])

    expect(blockCount(await selectBlocks(db, id))).toBe(4)
    await db.close()
  })
})
