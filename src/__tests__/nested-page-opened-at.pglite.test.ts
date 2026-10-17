// Proves markOpened's read-merge-write shape (lib/pages/nested-page.ts) is
// idempotent against a real `pages.props` column (KAN-122): opening a nested
// page twice writes `openedAt` once, not twice with two different timestamps.
// No migration — `props` already exists; this exercises the column, not a
// schema change. Raw SQL stands in for the two supabase-js calls `markOpened`
// makes (no supabase-js/PGLite bridge in this repo, same as every other
// pglite test here), but the merge check itself is the real production
// function — not a reimplementation of it.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'
import { isNewNestedPage } from '@/lib/pages/nested-page'

const USER = '11111111-1111-1111-1111-111111111111'

async function addPage(db: PGlite, props: Record<string, unknown>): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, props)
     values ($1, null, 'page', 'cabinets', $2) returning id`,
    [USER, JSON.stringify(props)]
  )
  return res.rows[0].id
}

async function propsOf(db: PGlite, id: string): Promise<Record<string, unknown>> {
  const res = await db.query<{ props: Record<string, unknown> }>(
    'select props from public.pages where id = $1',
    [id]
  )
  return res.rows[0].props
}

/** The exact select → check → merge → update markOpened performs, against the real column. */
async function openOnce(db: PGlite, id: string): Promise<void> {
  const current = await propsOf(db, id)
  if (!isNewNestedPage(current)) return
  const next = { ...current, openedAt: new Date().toISOString() }
  await db.query('update public.pages set props = $1 where id = $2', [JSON.stringify(next), id])
}

describe('nested-page openedAt — markOpened is idempotent', () => {
  it('writes openedAt on the first open', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db, { kind: 'nested page', nestedFrom: 'parent-1' })

    await openOnce(db, id)

    const after = await propsOf(db, id)
    expect(typeof after.openedAt).toBe('string')
    expect(isNewNestedPage(after)).toBe(false)
    await db.close()
  })

  it('opening twice leaves the SAME openedAt — the second open is a no-op', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db, { kind: 'nested page', nestedFrom: 'parent-1' })

    await openOnce(db, id)
    const firstStamp = (await propsOf(db, id)).openedAt

    await openOnce(db, id)
    const secondStamp = (await propsOf(db, id)).openedAt

    expect(secondStamp).toBe(firstStamp)
    await db.close()
  })

  it('does nothing to a page that was never nested', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db, {})

    await openOnce(db, id)

    expect(await propsOf(db, id)).toEqual({})
    await db.close()
  })
})
