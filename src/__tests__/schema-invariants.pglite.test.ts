// Schema-invariant tests (issue #74) — run the REAL supabase/migrations against
// an in-process Postgres (PGLite) and assert cascade + workspace semantics that
// live in the schema, not application code, via raw SQL.
//
// Seam under test: the Postgres schema itself. These deliberately bypass the
// supabase-js builder (mocked everywhere else) so they observe genuine DB
// behavior — deleting a page really removes its subtree, the workspace column
// really defaults and isolates.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, migrationFiles, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

/** Insert a page, returning its generated id. */
/** The `life` pond `handle_new_user` makes for a seeded person (0018). */
async function lifePondId(db: PGlite, userId: string = USER): Promise<string> {
  const res = await db.query<{ id: string }>(
    'select id from public.ponds where user_id = $1 order by "order" limit 1',
    [userId]
  )
  return res.rows[0].id
}

async function addPage(
  db: PGlite,
  opts: {
    userId?: string
    parentId?: string | null
    type?: string
    title?: string
    /**
     * #312: 0019 drops the user-keyed `pages_sibling_title_uniq` in favour of
     * 0018's `pages_sibling_title_pond_uniq`, so sibling names are constrained
     * PER POND. A row with no pond is constrained by nothing — pass one to
     * exercise the index.
     */
    pondId?: string | null
  } = {}
): Promise<string> {
  const { userId = USER, parentId = null, type = 'page', title = 'Untitled' } = opts
  // Only pass `workspace` when explicitly set, so C3 can exercise the DEFAULT.
  const cols = ['user_id', 'parent_id', 'type', 'title']
  const vals: unknown[] = [userId, parentId, type, title]
  if (opts.pondId !== undefined) {
    cols.push('pond_id')
    vals.push(opts.pondId)
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  const res = await db.query<{ id: string }>(
    `insert into public.pages (${cols.map((c) => `"${c}"`).join(', ')})
     values (${placeholders}) returning id`,
    vals
  )
  return res.rows[0].id
}

async function pageExists(db: PGlite, id: string): Promise<boolean> {
  const res = await db.query('select 1 from public.pages where id = $1', [id])
  return res.rows.length > 0
}

describe('PGLite schema invariants', () => {
  // Harness self-check: the migrations must load clean end-to-end. This is the
  // known-risk step (auth shim + vector ext + trigger), so it gets its own test.
  it('applies every real migration from disk clean, ending on the unified pages tree', async () => {
    const db = await makeDb()

    // Migrations are read from disk (not fixtures) so new ones are auto-covered.
    // Anchor on lexical ordering + the migrations that own the invariants under
    // test, rather than a frozen filename list that goes stale as migrations grow.
    const migNames = migrationFiles().map((m) => m.name)
    expect(migNames.length).toBeGreaterThanOrEqual(7)
    expect(migNames).toEqual([...migNames].sort()) // applied in lexical order
    expect(migNames[0]).toBe('0001_initial_schema.sql')
    expect(migNames).toContain('0003_unified_pages.sql') // cascade FK (C1/C2)
    expect(migNames).toContain('0005_add_workspace_discriminator.sql') // workspace (C3/C4)

    // 0004 dropped the legacy node tables; the unified `pages` tree remains.
    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    )
    const tableNames = tables.rows.map((r) => r.table_name)
    expect(tableNames).toContain('pages')
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('conversations')
    expect(tableNames).toContain('templates') // #154 template store
    expect(tableNames).not.toContain('areas')
    expect(tableNames).not.toContain('documents')

    await db.close()
  })

  // C1 — multi-level cascade. Deleting a top area removes its entire ≥3-level
  // subtree, and leaves an unrelated tree fully intact.
  it('C1: cascades a delete through a 3-level subtree, sparing unrelated trees', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    const area = await addPage(db, { type: 'page', title: 'Target area' })
    const project = await addPage(db, { parentId: area, type: 'project', title: 'Project' })
    const action = await addPage(db, { parentId: project, type: 'action', title: 'Action' })

    const otherArea = await addPage(db, { type: 'page', title: 'Bystander area' })
    const otherChild = await addPage(db, {
      parentId: otherArea,
      type: 'project',
      title: 'Bystander child',
    })

    await db.query('delete from public.pages where id = $1', [area])

    // Whole 3-level chain gone (grandchild too, not just the direct child).
    expect(await pageExists(db, area)).toBe(false)
    expect(await pageExists(db, project)).toBe(false)
    expect(await pageExists(db, action)).toBe(false)
    // Unrelated tree untouched.
    expect(await pageExists(db, otherArea)).toBe(true)
    expect(await pageExists(db, otherChild)).toBe(true)

    await db.close()
  })

  // C2 — mid-tree delete. Deleting the middle node removes it + descendants,
  // but the ancestor above it and a sibling branch survive.
  it('C2: deleting a mid-tree node removes its subtree but spares ancestor and siblings', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    const area = await addPage(db, { type: 'page', title: 'Area' })
    const middle = await addPage(db, { parentId: area, type: 'project', title: 'Middle' })
    const leaf = await addPage(db, { parentId: middle, type: 'action', title: 'Leaf' })
    const sibling = await addPage(db, { parentId: area, type: 'project', title: 'Sibling' })

    await db.query('delete from public.pages where id = $1', [middle])

    expect(await pageExists(db, middle)).toBe(false)
    expect(await pageExists(db, leaf)).toBe(false)
    expect(await pageExists(db, area)).toBe(true) // ancestor survives
    expect(await pageExists(db, sibling)).toBe(true) // sibling branch survives

    await db.close()
  })

  // C3 — workspace DEFAULT. A page inserted without a workspace reads back 'main'.
  // C3 and C4 asserted the `workspace` column's default and its main/sandbox
  // isolation. 0020 retired the column: the sandbox is a POND (#315), and
  // per-pond isolation is asserted by the pond tests below and in
  // `ponds.pglite.test.ts`.

  // C4 — workspace isolation. A workspace-scoped SELECT returns only that
  // scope's rows, with no bleed in either direction.
})

// ── #84 — sibling-name uniqueness (migration 0009) ────────────────────────────
// The unique index pages_sibling_title_uniq enforces "no two siblings share a
// name" per (user_id, workspace, parent-or-root, lower(btrim(title))), and the
// migration's dedupe step collapses the historical duplicates first.
// ── Blast radius (#145) ──────────────────────────────────────────────────────
//
// NB on what this proves: the harness connects as the PGLite OWNER, who bypasses
// RLS entirely, so these assert the SHAPE of the policy — which verbs it grants —
// not its enforcement against a live `authenticated` session. That is the same
// technique the change-log suite uses for its own no-delete-policy claim. Proving
// enforcement needs a non-owner role in the harness, which is its own job.

describe('users policy blast radius (#145)', () => {
  it('grants the mirror row no DELETE — one stray delete cannot cascade the pond away', async () => {
    const db = await makeDb()

    // `0001_initial_schema.sql:13-14` opened with `for all using (auth.uid() = id)`.
    // `for all` includes DELETE, `public.pages` cascades off `public.users`
    // (`0003:16`) along with six more tables in 0001, and the app ships an anon
    // browser client — so `from('users').delete().eq('id', myId)` took the whole
    // page tree with it. Not a breach (single-user; the only actor is the owner)
    // but nothing stood between one stray statement and everything.
    const policies = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'users'`
    )
    const cmds = policies.rows.map((r) => r.cmd).sort()

    expect(cmds).not.toContain('DELETE')
    expect(cmds).not.toContain('ALL')
    // No application code touches public.users: the mirror row is written by
    // 0001's SECURITY DEFINER trigger on auth.users, which bypasses RLS. So the
    // client needs exactly one verb.
    expect(cmds).toEqual(['SELECT'])
    await db.close()
  })

  it('still lets the account itself go, taking its pond with it', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addPage(db, { title: 'Root' })

    // Narrowing the policy must not make accounts undeletable: a genuine account
    // deletion goes through auth.users and cascades as before.
    await db.query('delete from auth.users where id = $1', [USER])

    const users = await db.query<{ n: number }>('select count(*)::int as n from public.users')
    const pages = await db.query<{ n: number }>('select count(*)::int as n from public.pages')
    expect(users.rows[0].n).toBe(0)
    expect(pages.rows[0].n).toBe(0)
    await db.close()
  })
})

describe('sibling-name uniqueness (0009)', () => {
  it('rejects two siblings with the same normalized title under the same parent', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    // `seedUser` fires 0018's `handle_new_user`, which makes the person's `life`
    // pond — the scope the index is now keyed on.
    const pondId = await lifePondId(db)
    const area = await addPage(db, { type: 'page', title: 'Area', pondId })
    await addPage(db, { parentId: area, title: 'Notes', pondId })
    // case-insensitive + trimmed → same key → rejected.
    await expect(addPage(db, { parentId: area, title: '  notes ', pondId })).rejects.toThrow()
    await db.close()
  })

  it('allows the same sibling title in a DIFFERENT pond (#312)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const life = await lifePondId(db)
    const other = await db.query<{ id: string }>(
      `insert into public.ponds (user_id, name, "order") values ($1, 'make noise', 1) returning id`,
      [USER]
    )
    // The whole point of a pond: the same name in two ponds is two pages.
    await addPage(db, { title: 'Notes', pondId: life })
    await addPage(db, { title: 'Notes', pondId: other.rows[0].id })
    const n = await db.query<{ n: number }>(
      `select count(*)::int as n from public.pages where lower(btrim(title)) = 'notes'`
    )
    expect(n.rows[0].n).toBe(2)
    await db.close()
  })

  it('rejects duplicate ROOT (null-parent) siblings — proves the COALESCE guard', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pondId = await lifePondId(db)
    await addPage(db, { type: 'page', title: 'Personal', pondId })
    // Without COALESCE(parent_id, sentinel) a plain unique index would treat the
    // two NULL parents as distinct and let this through — the original bug. 0018's
    // pond-keyed index carries the same COALESCE, so the guard survives the re-key.
    await expect(addPage(db, { type: 'page', title: 'Personal', pondId })).rejects.toThrow()
    await db.close()
  })

  it('allows the same title under two different parents', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const a = await addPage(db, { type: 'page', title: 'A' })
    const b = await addPage(db, { type: 'page', title: 'B' })
    await addPage(db, { parentId: a, title: 'Notes' })
    const second = await addPage(db, { parentId: b, title: 'Notes' })
    expect(await pageExists(db, second)).toBe(true)
    await db.close()
  })

  it('allows multiple blank-titled siblings (placeholders are exempt from the index)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const area = await addPage(db, { type: 'page', title: 'Area' })
    // New pages / collection rows start blank; several under one parent is normal.
    const a = await addPage(db, { parentId: area, title: '' })
    const b = await addPage(db, { parentId: area, title: '' })
    expect(await pageExists(db, a)).toBe(true)
    expect(await pageExists(db, b)).toBe(true)
    await db.close()
  })

  it('allows the same title in a different pond (0020 retired workspaces)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const life = await lifePondId(db)
    const elsewhere = (
      await db.query<{ id: string }>(
        `insert into public.ponds (user_id, name, "order") values ($1, 'elsewhere', 8) returning id`,
        [USER]
      )
    ).rows[0].id
    await addPage(db, { type: 'page', title: 'Shared', pondId: life })
    const other = await addPage(db, { type: 'page', title: 'Shared', pondId: elsewhere })
    expect(await pageExists(db, other)).toBe(true)
    await db.close()
  })

  it('dedupe collapses duplicate siblings onto one keeper, preserving children', async () => {
    // `through` 0009: this re-applies 0009's own SQL, which selects `p.workspace`,
    // and 0020 dropped that column.
    const db = await makeDb({ through: '0009_unique_sibling_title.sql' })
    await seedUser(db, USER)
    // Drop the index so we can seed the very duplicates 0009 is meant to clean.
    await db.exec('drop index if exists pages_sibling_title_uniq')

    // Keeper: a root 'Health' with 2 children. One empty twin. One twin w/ 1 child.
    const keeper = await addPage(db, { type: 'page', title: 'Health' })
    await addPage(db, { parentId: keeper, title: 'Weight' })
    await addPage(db, { parentId: keeper, title: 'Sleep' })
    await addPage(db, { type: 'page', title: 'Health' }) // empty twin
    const twin = await addPage(db, { type: 'page', title: 'Health' })
    await addPage(db, { parentId: twin, title: 'Lose 40 lbs' })

    // Re-run the full 0009 migration: dedupe + recreate the index.
    const mig = migrationFiles().find((m) => m.name.startsWith('0009'))!
    await db.exec(mig.sql)

    // Exactly one root 'Health' survives, and it's the keeper (most children).
    const roots = await db.query<{ id: string }>(
      "select id from public.pages where parent_id is null and lower(btrim(title)) = 'health'"
    )
    expect(roots.rows).toHaveLength(1)
    expect(roots.rows[0].id).toBe(keeper)

    // It now holds all three children (2 original + the reparented 'Lose 40 lbs').
    const kids = await db.query<{ title: string }>(
      'select title from public.pages where parent_id = $1',
      [keeper]
    )
    expect(kids.rows.map((r) => r.title).sort()).toEqual(['Lose 40 lbs', 'Sleep', 'Weight'])

    // And the index is back: a fresh duplicate is rejected again.
    await expect(addPage(db, { type: 'page', title: 'Health' })).rejects.toThrow()
    await db.close()
  })
})

// ── #154 — the template store (migration 0016) ───────────────────────────────
//
// `public.templates` is the data layer under the whole Phase 4 template system.
// Four schema facts are proved here against real Postgres: the kind CHECK holds
// the vocabulary to the twelve fixed labels, the unique index refuses a
// same-pond name collision case-insensitively, the same name is fine in another
// workspace (a pond is user + workspace), and deleting a template leaves every
// page carrying its made-from stamp byte-identical — a template is a shape you
// copy, never a tie, so there is no FK and nothing cascades or nulls out.

const TEMPLATE_KIND_LABELS = [
  'page',
  'notes',
  'list',
  'project',
  'tracker',
  'journal',
  'collection',
  'database',
  'dashboard',
  'meeting notes',
  'reading list',
  'habit',
]

async function addTemplate(
  db: PGlite,
  opts: { name: string; kind?: string; pondId?: string; origin?: string; userId?: string }
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.templates (user_id, pond_id, name, kind, origin)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      opts.userId ?? USER,
      opts.pondId ?? (await lifePondId(db, opts.userId ?? USER)),
      opts.name,
      opts.kind ?? 'notes',
      opts.origin ?? 'yours',
    ]
  )
  return res.rows[0].id
}

describe('template store (0016)', () => {
  it('ships the columns the spec names, with their defaults', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const id = await addTemplate(db, { name: 'Weekly review', kind: 'meeting notes' })

    const res = await db.query<{
      pond_id: string
      blocks: unknown
      origin: string
      created_at: string
      updated_at: string
    }>(
      'select pond_id, blocks, origin, created_at, updated_at from public.templates where id = $1',
      [id]
    )
    expect(res.rows[0].pond_id).toBeTruthy()
    expect(res.rows[0].blocks).toEqual([])
    expect(res.rows[0].origin).toBe('yours')
    expect(res.rows[0].created_at).toBeTruthy()
    expect(res.rows[0].updated_at).toBeTruthy()
    await db.close()
  })

  it('accepts each of the twelve kinds and rejects an unknown one (the kind CHECK)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    for (const [i, kind] of TEMPLATE_KIND_LABELS.entries()) {
      await expect(addTemplate(db, { name: `T${i}`, kind })).resolves.toBeTruthy()
    }
    await expect(addTemplate(db, { name: 'Bad', kind: 'recipe' })).rejects.toThrow()
    // The mockup's abbreviations are a prop artefact, not the vocabulary.
    await expect(addTemplate(db, { name: 'Abbrev', kind: 'meeting' })).rejects.toThrow()
    await expect(addTemplate(db, { name: 'Cased', kind: 'Page' })).rejects.toThrow()
    await db.close()
  })

  it("restricts origin to 'premade' | 'yours'", async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await expect(addTemplate(db, { name: 'A', origin: 'premade' })).resolves.toBeTruthy()
    await expect(addTemplate(db, { name: 'B', origin: 'yours' })).resolves.toBeTruthy()
    await expect(addTemplate(db, { name: 'C', origin: 'shared' })).rejects.toThrow()
    await db.close()
  })

  it('rejects a same-pond name collision case-insensitively (the unique index)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addTemplate(db, { name: 'Weekly review' })
    await expect(addTemplate(db, { name: 'weekly REVIEW' })).rejects.toThrow()
    await expect(addTemplate(db, { name: '  Weekly review ' })).rejects.toThrow()
    await db.close()
  })

  it('allows the same name in a different POND (0020 re-keyed the index)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const elsewhere = (
      await db.query<{ id: string }>(
        `insert into public.ponds (user_id, name, "order") values ($1, 'elsewhere', 7) returning id`,
        [USER]
      )
    ).rows[0].id
    await addTemplate(db, { name: 'Weekly review' })
    // Same name, different pond — legal, and the point of the re-key.
    const other = await addTemplate(db, { name: 'Weekly review', pondId: elsewhere })
    const res = await db.query('select 1 from public.templates where id = $1', [other])
    expect(res.rows).toHaveLength(1)
    await db.close()
  })

  it('deleting a template leaves every page carrying its provenance stamp byte-identical', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const tpl = await addTemplate(db, { name: 'Weekly review', kind: 'meeting notes' })

    // Two pages made from the template: the stamp is a sibling of `_schema` in
    // props, and the kind label is the ordinary editable `props.kind`.
    const props = JSON.stringify({
      _schema: [{ id: 'stage', name: 'Stage', type: 'status' }],
      kind: 'meeting notes',
      madeFromTemplate: { templateId: tpl, name: 'Weekly review', at: '2026-10-01T12:00:00.000Z' },
    })
    const a = await db.query<{ id: string }>(
      `insert into public.pages (user_id, type, title, props) values ($1, 'page', 'Review A', $2::jsonb) returning id`,
      [USER, props]
    )
    const b = await db.query<{ id: string }>(
      `insert into public.pages (user_id, type, title, props) values ($1, 'page', 'Review B', $2::jsonb) returning id`,
      [USER, props]
    )
    const ids = [a.rows[0].id, b.rows[0].id]

    const snapshot = async () =>
      (
        await db.query<{ row: string }>(
          `select to_jsonb(p)::text as row from public.pages p where id = any($1::uuid[]) order by id`,
          [ids]
        )
      ).rows.map((r) => r.row)

    const before = await snapshot()
    expect(before).toHaveLength(2)
    expect(before[0]).toContain(tpl) // the stamp really is in there

    await db.query('delete from public.templates where id = $1', [tpl])

    const gone = await db.query('select 1 from public.templates where id = $1', [tpl])
    expect(gone.rows).toHaveLength(0)
    // Every column of every stamped page — props, updated_at, all of it — unchanged.
    expect(await snapshot()).toEqual(before)
    await db.close()
  })

  it('has RLS on with four separate per-verb policies and no `for all`', async () => {
    const db = await makeDb()
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'public.templates'::regclass`
    )
    expect(rls.rows[0].relrowsecurity).toBe(true)

    // 0012 exists because `for all` on the users mirror row let one stray delete
    // cascade the pond away (#145). New tables grant verbs one at a time.
    const policies = await db.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'templates'`
    )
    expect(policies.rows.map((r) => r.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    await db.close()
  })

  it('cascades templates away with the account (auth.users), not with a page', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addTemplate(db, { name: 'Weekly review' })
    const page = await addPage(db, { title: 'Unrelated' })

    // A page going does nothing to templates (no tie in either direction).
    await db.query('delete from public.pages where id = $1', [page])
    expect(
      (await db.query<{ n: number }>('select count(*)::int as n from public.templates')).rows[0].n
    ).toBe(1)

    // The account going takes its templates with it.
    await db.query('delete from auth.users where id = $1', [USER])
    expect(
      (await db.query<{ n: number }>('select count(*)::int as n from public.templates')).rows[0].n
    ).toBe(0)
    await db.close()
  })
})
