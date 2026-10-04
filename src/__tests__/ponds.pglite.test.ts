// Schema tests for 0018_ponds.sql (#312, #314).
//
// The migration adds the pond record and a NULLABLE tenancy key, and backfills
// it. Three things are worth proving against real Postgres rather than reasoning
// about: the backfill stamps every row in the right pond, the sandbox pond is
// conditional, and the two pre-existing unique indexes SURVIVE.
//
// That last one is here because the first version of this migration re-keyed
// them onto `pond_id` and the pglite suite caught it: NULLs are distinct in a
// unique index and every app insert still omits `pond_id`, so re-keying silently
// disabled sibling-title uniqueness for the whole transition. Both pairs now
// coexist, and this test is what stops someone "tidying up" the old ones before
// `pond_id` is NOT NULL.

import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'
const SOLO = '22222222-2222-2222-2222-222222222222'

/** A db one migration short of 0018, with rows in both workspaces. */
async function dbBefore(opts: { sandbox: boolean } = { sandbox: true }): Promise<PGlite> {
  const db = await makeDb({ through: '0017_lowercase_seed_titles.sql' })
  const user = opts.sandbox ? USER : SOLO
  await seedUser(db, user)

  await db.query(
    `insert into public.pages (user_id, parent_id, type, title, workspace)
     values ($1, null, 'page', 'main page', 'main')`,
    [user]
  )
  await db.query(`insert into public.conversations (user_id, workspace) values ($1, 'main')`, [
    user,
  ])
  await db.query(
    `insert into public.change_log (user_id, workspace, status, action)
     values ($1, 'main', 'proposed', 'edit')`,
    [user]
  )
  await db.query(
    `insert into public.templates (user_id, workspace, name, kind, origin)
     values ($1, 'main', 'a shape', 'page', 'yours')`,
    [user]
  )

  if (opts.sandbox) {
    await db.query(
      `insert into public.pages (user_id, parent_id, type, title, workspace)
       values ($1, null, 'page', 'sandbox page', 'sandbox')`,
      [user]
    )
    await db.query(`insert into public.conversations (user_id, workspace) values ($1, 'sandbox')`, [
      user,
    ])
  }
  return db
}

describe('0018_ponds — the backfill', () => {
  it('gives a user with sandbox rows two ponds, life first', async () => {
    const db = await dbBefore()
    await applyMigration(db, '0018_ponds.sql')

    const res = await db.query<{ name: string; order: number; glyph: string; theme: string }>(
      'select name, "order", glyph, theme from public.ponds where user_id = $1 order by "order"',
      [USER]
    )
    expect(res.rows).toEqual([
      { name: 'life', order: 0, glyph: 'waves-02', theme: 'paper' },
      { name: 'sandbox', order: 1, glyph: 'waves-02', theme: 'paper' },
    ])
    await db.close()
  })

  it('gives a user with NO sandbox rows exactly one pond (#315 as ruled)', async () => {
    // The decision was narrowed deliberately: minting an empty second pond at ⌘2
    // that nobody made is the phantom content #320 forbids.
    const db = await dbBefore({ sandbox: false })
    await applyMigration(db, '0018_ponds.sql')

    const res = await db.query<{ name: string }>(
      'select name from public.ponds where user_id = $1',
      [SOLO]
    )
    expect(res.rows).toEqual([{ name: 'life' }])
    await db.close()
  })

  it('stamps every row in all four tables, matching workspace to pond', async () => {
    const db = await dbBefore()
    await applyMigration(db, '0018_ponds.sql')

    // Nothing left behind. The migration asserts this itself and raises, so a
    // regression here fails at apply time — this pins the contract anyway.
    for (const table of ['pages', 'conversations', 'change_log', 'templates']) {
      const nulls = await db.query<{ n: number }>(
        `select count(*)::int as n from public.${table} where pond_id is null`
      )
      expect(nulls.rows[0].n).toBe(0)
    }

    const rows = await db.query<{ title: string; pond: string }>(
      `select p.title, d.name as pond
         from public.pages p join public.ponds d on d.id = p.pond_id
        where p.user_id = $1 order by p.title`,
      [USER]
    )
    expect(rows.rows).toEqual([
      { title: 'main page', pond: 'life' },
      { title: 'sandbox page', pond: 'sandbox' },
    ])

    // change_log carries the key despite being append-only: `pond_id` is not in
    // `change_log_append_only()`'s frozen identity list, so the backfill's UPDATE
    // passes. If someone adds it to that list, this breaks — which is the point.
    const log = await db.query<{ pond: string }>(
      `select d.name as pond from public.change_log l
         join public.ponds d on d.id = l.pond_id where l.user_id = $1`,
      [USER]
    )
    expect(log.rows).toEqual([{ pond: 'life' }])
    await db.close()
  })

  it('is replayable — applying it twice creates no extra ponds', async () => {
    const db = await dbBefore()
    await applyMigration(db, '0018_ponds.sql')
    await applyMigration(db, '0018_ponds.sql')

    const res = await db.query<{ n: number }>(
      'select count(*)::int as n from public.ponds where user_id = $1',
      [USER]
    )
    expect(res.rows[0].n).toBe(2)
    await db.close()
  })
})

describe('0018_ponds — the pond record', () => {
  it('creates a life pond for a brand-new account', async () => {
    // handle_new_user now seeds the pond too; without it a new sign-up has none.
    const db = await makeDb()
    await seedUser(db, USER)

    const res = await db.query<{ name: string; order: number }>(
      'select name, "order" from public.ponds where user_id = $1',
      [USER]
    )
    expect(res.rows).toEqual([{ name: 'life', order: 0 }])
    await db.close()
  })

  it("holds no pages until it is visited (#320's root is created lazily)", async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    const res = await db.query<{ n: number }>(
      'select count(*)::int as n from public.pages where user_id = $1',
      [USER]
    )
    expect(res.rows[0].n).toBe(0)
    await db.close()
  })

  it('admits all eight themes the board draws and refuses a ninth', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const eight = ['paper', 'ink', 'sage', 'mist', 'navy', 'wheat', 'burnt-orange', 'ember']
    for (const theme of eight) {
      await db.query(
        `insert into public.ponds (user_id, name, theme, "order") values ($1, $2, $3, 9)`,
        [USER, `pond ${theme}`, theme]
      )
    }
    await expect(
      db.query(
        `insert into public.ponds (user_id, name, theme, "order") values ($1, 'x', 'teal', 9)`,
        [USER]
      )
    ).rejects.toThrow()
    await db.close()
  })

  it('has select/insert/update policies and deliberately NO delete policy', async () => {
    // Deleting a pond is unresolved on #312 — the change log is append-only at
    // the database level, so a pond with history cannot simply cascade away.
    // Until it is designed, a client cannot attempt one.
    const db = await makeDb()
    const res = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'ponds' order by cmd`
    )
    expect(res.rows.map((r) => r.cmd).sort()).toEqual(['INSERT', 'SELECT', 'UPDATE'])
    await db.close()
  })
})

describe('0018_ponds — the old unique indexes survive', () => {
  it('keeps 0006 and 0009 alongside the pond-keyed pair', async () => {
    const db = await makeDb()
    const res = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'pages' order by indexname`
    )
    const names = res.rows.map((r) => r.indexname)
    // The old pair still constrains rows that have no pond yet…
    expect(names).toContain('pages_one_home_per_user')
    expect(names).toContain('pages_sibling_title_uniq')
    // …and the new pair constrains rows that do.
    expect(names).toContain('pages_one_root_per_pond')
    expect(names).toContain('pages_sibling_title_pond_uniq')
    await db.close()
  })

  it('still rejects duplicate sibling titles for rows with a null pond_id', async () => {
    // The regression this file exists for. Every app insert omits `pond_id`
    // today, so if only the pond-keyed index existed, both of these would land.
    const db = await makeDb()
    await seedUser(db, USER)
    await db.query(
      `insert into public.pages (user_id, parent_id, type, title) values ($1, null, 'page', 'Notes')`,
      [USER]
    )
    await expect(
      db.query(
        `insert into public.pages (user_id, parent_id, type, title) values ($1, null, 'page', '  notes ')`,
        [USER]
      )
    ).rejects.toThrow()
    await db.close()
  })
})
