// Schema tests for 0015_page_mark.sql (issue #134).
//
// The columns are the floor under the picker: NULL has to mean "derive", and the
// role column has to refuse anything that is not a role the theme defines — a
// stored `sage` or `#648F7B` would pin a mark to one palette and defeat the whole
// reason the column holds a role. Proved against real Postgres (PGLite, the real
// migrations from disk) rather than a mocked builder.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

// Titles must differ: 0009 puts a unique index on (parent, title) among siblings.
let seq = 0
async function addPage(
  db: PGlite,
  opts: { glyph?: string | null; areaRole?: string | null } = {}
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, glyph, area_role)
     values ($1, null, 'page', $2, $3, $4) returning id`,
    [USER, `Area ${++seq}`, opts.glyph ?? null, opts.areaRole ?? null]
  )
  return res.rows[0].id
}

describe('0015_page_mark', () => {
  it('adds both columns, nullable, defaulting to null', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addPage(db)

    const res = await db.query<{ glyph: string | null; area_role: string | null }>(
      'select glyph, area_role from public.pages where id = $1',
      [id]
    )
    // Null on both = derive. That is what makes this additive with no backfill:
    // every page that existed before the migration reads exactly as it did.
    expect(res.rows[0]).toEqual({ glyph: null, area_role: null })
    await db.close()
  })

  it('accepts each role the theme defines', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    for (const role of ['area-a', 'area-b', 'area-c']) {
      await expect(addPage(db, { areaRole: role })).resolves.toBeTruthy()
    }
    await db.close()
  })

  it('refuses a raw colour name or a hex — the column holds a ROLE', async () => {
    // "Raw palette values never move — only roles reassign" (AGENTS.md). A stored
    // `sage` would survive a theme change and then be wrong; a stored hex would
    // be wrong in dark mode immediately.
    const db = await makeDb()
    await seedUser(db, USER)
    await expect(addPage(db, { areaRole: 'sage' })).rejects.toThrow()
    await expect(addPage(db, { areaRole: '#648F7B' })).rejects.toThrow()
    await expect(addPage(db, { areaRole: 'area-d' })).rejects.toThrow()
    await db.close()
  })

  it('takes any glyph name, including one the picker does not offer', async () => {
    // The 140 `asset-N` files are not offered, but a stored one must still be
    // valid — the curated library is a picker concern, never a data rule.
    const db = await makeDb()
    await seedUser(db, USER)
    await expect(addPage(db, { glyph: 'asset-113' })).resolves.toBeTruthy()
    await db.close()
  })

  it('is idempotent — a replay installs the constraint exactly once', async () => {
    // `add column if not exists` SKIPS its inline CHECK when the column is
    // already there, which is why the constraint is added separately and guarded.
    const db = await makeDb()
    await seedUser(db, USER)
    const { applyMigration } = await import('./helpers/pglite-harness')
    await expect(applyMigration(db, '0015_page_mark.sql')).resolves.toBeUndefined()

    const res = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_constraint where conname = 'pages_area_role_check'`
    )
    expect(res.rows[0].n).toBe(1)
    // And it still bites after the replay.
    await expect(addPage(db, { areaRole: 'nope' })).rejects.toThrow()
    await db.close()
  })
})
