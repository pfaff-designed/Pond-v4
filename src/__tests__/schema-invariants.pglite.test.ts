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
async function addPage(
  db: PGlite,
  opts: {
    userId?: string
    parentId?: string | null
    type?: string
    title?: string
    workspace?: string
  } = {}
): Promise<string> {
  const { userId = USER, parentId = null, type = 'page', title = 'Untitled' } = opts
  // Only pass `workspace` when explicitly set, so C3 can exercise the DEFAULT.
  const cols = ['user_id', 'parent_id', 'type', 'title']
  const vals: unknown[] = [userId, parentId, type, title]
  if (opts.workspace !== undefined) {
    cols.push('workspace')
    vals.push(opts.workspace)
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
  it("C3: workspace defaults to 'main' when unspecified", async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    const id = await addPage(db, { type: 'page', title: 'No workspace given' })

    const res = await db.query<{ workspace: string }>(
      'select workspace from public.pages where id = $1',
      [id]
    )
    expect(res.rows[0].workspace).toBe('main')

    await db.close()
  })

  // C4 — workspace isolation. A workspace-scoped SELECT returns only that
  // scope's rows, with no bleed in either direction.
  it('C4: workspace-scoped selects isolate main and sandbox in both directions', async () => {
    const db = await makeDb()
    await seedUser(db, USER)

    const mainPage = await addPage(db, { type: 'page', title: 'Main row', workspace: 'main' })
    const sandboxPage = await addPage(db, {
      type: 'page',
      title: 'Sandbox row',
      workspace: 'sandbox',
    })

    const mainRows = await db.query<{ id: string }>(
      "select id from public.pages where user_id = $1 and workspace = 'main'",
      [USER]
    )
    const sandboxRows = await db.query<{ id: string }>(
      "select id from public.pages where user_id = $1 and workspace = 'sandbox'",
      [USER]
    )

    const mainIds = mainRows.rows.map((r) => r.id)
    const sandboxIds = sandboxRows.rows.map((r) => r.id)

    // main scope sees the main row, never the sandbox row.
    expect(mainIds).toContain(mainPage)
    expect(mainIds).not.toContain(sandboxPage)
    // sandbox scope sees the sandbox row, never the main row.
    expect(sandboxIds).toContain(sandboxPage)
    expect(sandboxIds).not.toContain(mainPage)

    await db.close()
  })
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
    const area = await addPage(db, { type: 'page', title: 'Area', workspace: 'main' })
    await addPage(db, { parentId: area, title: 'Notes', workspace: 'main' })
    // case-insensitive + trimmed → same key → rejected.
    await expect(
      addPage(db, { parentId: area, title: '  notes ', workspace: 'main' })
    ).rejects.toThrow()
    await db.close()
  })

  it('rejects duplicate ROOT (null-parent) siblings — proves the COALESCE guard', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addPage(db, { type: 'page', title: 'Personal', workspace: 'main' })
    // Without COALESCE(parent_id, sentinel) a plain unique index would treat the
    // two NULL parents as distinct and let this through — the original bug.
    await expect(
      addPage(db, { type: 'page', title: 'Personal', workspace: 'main' })
    ).rejects.toThrow()
    await db.close()
  })

  it('allows the same title under two different parents', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const a = await addPage(db, { type: 'page', title: 'A', workspace: 'main' })
    const b = await addPage(db, { type: 'page', title: 'B', workspace: 'main' })
    await addPage(db, { parentId: a, title: 'Notes', workspace: 'main' })
    const second = await addPage(db, { parentId: b, title: 'Notes', workspace: 'main' })
    expect(await pageExists(db, second)).toBe(true)
    await db.close()
  })

  it('allows multiple blank-titled siblings (placeholders are exempt from the index)', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const area = await addPage(db, { type: 'page', title: 'Area', workspace: 'main' })
    // New pages / collection rows start blank; several under one parent is normal.
    const a = await addPage(db, { parentId: area, title: '', workspace: 'main' })
    const b = await addPage(db, { parentId: area, title: '', workspace: 'main' })
    expect(await pageExists(db, a)).toBe(true)
    expect(await pageExists(db, b)).toBe(true)
    await db.close()
  })

  it('allows the same title in different workspaces', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await addPage(db, { type: 'page', title: 'Shared', workspace: 'main' })
    const sandbox = await addPage(db, { type: 'page', title: 'Shared', workspace: 'sandbox' })
    expect(await pageExists(db, sandbox)).toBe(true)
    await db.close()
  })

  it('dedupe collapses duplicate siblings onto one keeper, preserving children', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    // Drop the index so we can seed the very duplicates 0009 is meant to clean.
    await db.exec('drop index if exists pages_sibling_title_uniq')

    // Keeper: a root 'Health' with 2 children. One empty twin. One twin w/ 1 child.
    const keeper = await addPage(db, { type: 'page', title: 'Health', workspace: 'main' })
    await addPage(db, { parentId: keeper, title: 'Weight', workspace: 'main' })
    await addPage(db, { parentId: keeper, title: 'Sleep', workspace: 'main' })
    await addPage(db, { type: 'page', title: 'Health', workspace: 'main' }) // empty twin
    const twin = await addPage(db, { type: 'page', title: 'Health', workspace: 'main' })
    await addPage(db, { parentId: twin, title: 'Lose 40 lbs', workspace: 'main' })

    // Re-run the full 0009 migration: dedupe + recreate the index.
    const mig = migrationFiles().find((m) => m.name.startsWith('0009'))!
    await db.exec(mig.sql)

    // Exactly one root 'Health' survives, and it's the keeper (most children).
    const roots = await db.query<{ id: string }>(
      "select id from public.pages where parent_id is null and lower(btrim(title)) = 'health' and workspace = 'main'"
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
    await expect(
      addPage(db, { type: 'page', title: 'Health', workspace: 'main' })
    ).rejects.toThrow()
    await db.close()
  })
})
