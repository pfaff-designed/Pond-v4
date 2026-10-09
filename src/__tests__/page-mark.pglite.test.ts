// Schema tests for 0015_page_mark.sql and 0022_area_only_colour.sql.
//
// The columns are the floor under the picker: NULL has to mean "automatic", and
// the role column has to refuse anything that is not a role the theme defines — a
// stored `sage` or `#648F7B` would pin a mark to one palette and defeat the whole
// reason the column holds a role. 0022 narrows the role to areas — top-level
// pages that are neither the home row nor the databases root; every other page
// takes its area's colour. Proved against real Postgres (PGLite, the real
// migrations from disk) rather than a mocked builder.

import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, makeDb, seedUser } from './helpers/pglite-harness'

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

  it('takes any glyph name, numbered ones included', async () => {
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

// ── 0022: colour belongs to areas ────────────────────────────────────────────

const MIGRATION = '0022_area_only_colour.sql'

/** A page under `parentId` (null = an area), with an optional stored role. */
async function addChild(
  db: PGlite,
  parentId: string | null,
  areaRole: string | null = null
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, area_role)
     values ($1, $2, 'page', $3, $4) returning id`,
    [USER, parentId, `Page ${++seq}`, areaRole]
  )
  return res.rows[0].id
}

/** A top-level row with an explicit type and title — the home row, the databases root. */
async function addTopLevel(
  db: PGlite,
  type: string,
  title: string,
  areaRole: string | null = null
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, area_role)
     values ($1, null, $2, $3, $4) returning id`,
    [USER, type, title, areaRole]
  )
  return res.rows[0].id
}

async function roleOf(db: PGlite, id: string): Promise<string | null> {
  const res = await db.query<{ area_role: string | null }>(
    'select area_role from public.pages where id = $1',
    [id]
  )
  return res.rows[0].area_role
}

describe('0022_area_only_colour — pages', () => {
  it('clears the role on every page that is not an area, and keeps the areas’', async () => {
    const db = await makeDb({ through: '0020_retire_workspace.sql' })
    await seedUser(db, USER)
    const area = await addChild(db, null, 'area-a')
    const page = await addChild(db, area, 'area-c')
    const deep = await addChild(db, page, 'area-b')

    await applyMigration(db, MIGRATION)

    expect(await roleOf(db, area)).toBe('area-a')
    expect(await roleOf(db, page)).toBeNull()
    expect(await roleOf(db, deep)).toBeNull()
    await db.close()
  })

  it('clears a role already on the home row and the databases root', async () => {
    const db = await makeDb({ through: '0020_retire_workspace.sql' })
    await seedUser(db, USER)
    const home = await addTopLevel(db, 'home', 'life', 'area-a')
    const dbRoot = await addTopLevel(db, 'page', ' Databases ', 'area-b')
    const area = await addChild(db, null, 'area-c')

    await applyMigration(db, MIGRATION)

    expect(await roleOf(db, home)).toBeNull()
    expect(await roleOf(db, dbRoot)).toBeNull()
    expect(await roleOf(db, area)).toBe('area-c')
    await db.close()
  })

  it('refuses a role on the home row and on the databases root', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await expect(addTopLevel(db, 'home', 'life', 'area-a')).rejects.toThrow()
    await expect(addTopLevel(db, 'page', 'databases', 'area-a')).rejects.toThrow()
    await expect(addTopLevel(db, 'page', ' DataBases ', 'area-a')).rejects.toThrow()

    const home = await addTopLevel(db, 'home', 'life')
    await expect(
      db.query(`update public.pages set area_role = 'area-a' where id = $1`, [home])
    ).rejects.toThrow()
    await db.close()
  })

  it('an area renamed to databases becomes the databases root and drops its role', async () => {
    // Sibling titles are unique per pond and parent, so this rename is only
    // possible in a pond that has no databases root yet — and then it succeeds.
    const db = await makeDb()
    await seedUser(db, USER)
    const area = await addChild(db, null, 'area-a')
    await db.query(`update public.pages set title = 'Databases' where id = $1`, [area])
    expect(await roleOf(db, area)).toBeNull()

    await db.query(`update public.pages set title = 'Garden' where id = $1`, [area])
    expect(await roleOf(db, area)).toBeNull()
    await db.close()
  })

  it('a pond that has a databases root refuses a second one by name', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await db.query<{ id: string }>('select id from public.ponds where user_id = $1', [
      USER,
    ])
    const pondId = pond.rows[0].id
    const insert = (title: string, areaRole: string | null) =>
      db.query<{ id: string }>(
        `insert into public.pages (user_id, pond_id, parent_id, type, title, area_role)
         values ($1, $2, null, 'page', $3, $4) returning id`,
        [USER, pondId, title, areaRole]
      )
    await insert('databases', null)
    const area = (await insert('Garden', 'area-a')).rows[0].id
    await expect(
      db.query(`update public.pages set title = 'Databases' where id = $1`, [area])
    ).rejects.toThrow(/pages_sibling_title_pond_uniq/)
    expect(await roleOf(db, area)).toBe('area-a')
    await db.close()
  })

  it('renaming an area to anything else keeps its role', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const area = await addChild(db, null, 'area-a')
    await db.query(`update public.pages set title = 'Garden' where id = $1`, [area])
    expect(await roleOf(db, area)).toBe('area-a')
    await db.close()
  })

  it('refuses a role on a page that is not an area', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const area = await addChild(db, null)
    await expect(addChild(db, area, 'area-a')).rejects.toThrow()
    const page = await addChild(db, area)
    await expect(
      db.query(`update public.pages set area_role = 'area-a' where id = $1`, [page])
    ).rejects.toThrow()
    await db.close()
  })

  it('still lets an area take, change and clear a role', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const area = await addChild(db, null, 'area-a')
    await db.query(`update public.pages set area_role = 'area-c' where id = $1`, [area])
    expect(await roleOf(db, area)).toBe('area-c')
    await db.query(`update public.pages set area_role = null where id = $1`, [area])
    expect(await roleOf(db, area)).toBeNull()
    await db.close()
  })

  it('an area moved inside another page drops its role and takes its new area’s', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const health = await addChild(db, null, 'area-a')
    const money = await addChild(db, null, 'area-c')

    await db.query('update public.pages set parent_id = $1 where id = $2', [health, money])
    expect(await roleOf(db, money)).toBeNull()

    // Moving it back out does not resurrect a colour nobody chose for it.
    await db.query('update public.pages set parent_id = null where id = $1', [money])
    expect(await roleOf(db, money)).toBeNull()
    await db.close()
  })

  it('moving a page between areas writes nothing to its role', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const health = await addChild(db, null, 'area-a')
    const money = await addChild(db, null, 'area-c')
    const page = await addChild(db, health)
    await db.query('update public.pages set parent_id = $1 where id = $2', [money, page])
    expect(await roleOf(db, page)).toBeNull()
    await db.close()
  })

  it('comments the column as area-only', async () => {
    const db = await makeDb()
    const res = await db.query<{ comment: string }>(
      `select col_description('public.pages'::regclass, attnum) as comment
         from pg_attribute where attrelid = 'public.pages'::regclass and attname = 'area_role'`
    )
    expect(res.rows[0].comment).toMatch(/areas only/i)
    await db.close()
  })

  it('is replayable', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await expect(applyMigration(db, MIGRATION)).resolves.toBeUndefined()
    const area = await addChild(db, null)
    await expect(addChild(db, area, 'area-a')).rejects.toThrow()
    await db.close()
  })
})

describe('0022_area_only_colour — recent glyphs on the pond', () => {
  async function pondOf(db: PGlite): Promise<string> {
    const res = await db.query<{ id: string }>(
      'select id from public.ponds where user_id = $1 order by "order" limit 1',
      [USER]
    )
    return res.rows[0].id
  }

  it('starts every pond with an empty list, never null', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const res = await db.query<{ recent_glyphs: string[] }>(
      'select recent_glyphs from public.ponds where id = $1',
      [await pondOf(db)]
    )
    expect(res.rows[0].recent_glyphs).toEqual([])
    await db.close()
  })

  it('holds up to eight glyphs, in order, and refuses a ninth', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pond = await pondOf(db)
    const eight = ['heart', 'leaf-01', 'sun', 'moon', 'tulip-01', 'ring', 'star-02', 'asset-113']
    await db.query('update public.ponds set recent_glyphs = $1 where id = $2', [eight, pond])
    const res = await db.query<{ recent_glyphs: string[] }>(
      'select recent_glyphs from public.ponds where id = $1',
      [pond]
    )
    expect(res.rows[0].recent_glyphs).toEqual(eight)
    await expect(
      db.query('update public.ponds set recent_glyphs = $1 where id = $2', [
        [...eight, 'eye'],
        pond,
      ])
    ).rejects.toThrow()
    await db.close()
  })
})
