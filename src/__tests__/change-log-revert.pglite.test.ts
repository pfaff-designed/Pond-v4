// Schema tests for 0013_accept_revert.sql (issue #103, spec #110).
//
// Seam under test: accepting a revert is THREE writes — the page, the revert, and
// the record it reverts — and spec #110 criterion 3 says they are one transaction
// or they are a bug. That is a promise about the DATABASE, so it is proved here
// against a real Postgres (PGLite, the real migrations from disk) rather than a
// mocked builder. The planner and the call shape are unit-tested in
// change-log-revert.test.ts; what is asserted here is atomicity and the
// preconditions — including that a refusal leaves the page BYTE-IDENTICAL, since
// the log only grows and a half-applied revert could never be repaired.

import type { PGlite } from '@electric-sql/pglite'
import { makeDb, seedUser } from './helpers/pglite-harness'

const USER = '11111111-1111-1111-1111-111111111111'

const BEFORE = [{ id: 'a', type: 'text', content: 'one' }]
const AFTER = [{ id: 'a', type: 'text', content: 'ONE' }]

async function addPage(
  db: PGlite,
  opts: { userId?: string; workspace?: string; blocks?: unknown } = {}
): Promise<string> {
  const { userId = USER, workspace = 'main', blocks = AFTER } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.pages (user_id, parent_id, type, title, workspace, blocks)
     values ($1, null, 'page', 'Target', $2, $3) returning id`,
    [userId, workspace, JSON.stringify(blocks)]
  )
  return res.rows[0].id
}

async function addRecord(
  db: PGlite,
  opts: {
    userId?: string
    workspace?: string
    status?: string
    action?: string
    pageId?: string | null
    before?: unknown
    after?: unknown
    links?: unknown
  } = {}
): Promise<string> {
  const {
    userId = USER,
    workspace = 'main',
    status = 'proposed',
    action = 'edit',
    pageId = null,
    before = null,
    after = null,
    links = {},
  } = opts
  const res = await db.query<{ id: string }>(
    `insert into public.change_log
       (user_id, workspace, status, action, actor, target_page_id, "before", "after",
        links, transitions)
     values ($1,$2,$3,$4,'you',$5,$6,$7,$8,$9) returning id`,
    [
      userId,
      workspace,
      status,
      action,
      pageId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify(links),
      JSON.stringify([{ status, at: new Date().toISOString(), actor: 'you' }]),
    ]
  )
  return res.rows[0].id
}

async function statusOf(db: PGlite, id: string): Promise<string | null> {
  const res = await db.query<{ status: string }>(
    'select status from public.change_log where id = $1',
    [id]
  )
  return res.rows[0]?.status ?? null
}

async function blocksOf(db: PGlite, pageId: string): Promise<unknown> {
  const res = await db.query<{ blocks: unknown }>('select blocks from public.pages where id = $1', [
    pageId,
  ])
  return res.rows[0]?.blocks ?? null
}

/** A page + an accepted edit + a proposed revert linked to it — the usual setup. */
async function scene(db: PGlite, over: { revertStatus?: string; originalStatus?: string } = {}) {
  await seedUser(db, USER)
  const pageId = await addPage(db)
  const original = await addRecord(db, {
    status: over.originalStatus ?? 'accepted',
    action: 'edit',
    pageId,
    before: BEFORE,
    after: AFTER,
  })
  const revert = await addRecord(db, {
    status: over.revertStatus ?? 'proposed',
    action: 'revert',
    pageId,
    before: AFTER,
    after: BEFORE,
    links: { revert_of: original },
  })
  return { pageId, original, revert }
}

function accept(db: PGlite, revertId: string, expected: unknown = AFTER, blocks: unknown = BEFORE) {
  return db.query(`select * from public.accept_revert_record($1, $2, $3, 'you')`, [
    revertId,
    JSON.stringify(blocks),
    JSON.stringify(expected),
  ])
}

// ── The happy path ───────────────────────────────────────────────────────────

describe('accept_revert_record — the three writes', () => {
  it('commits the page, accepts the revert, and marks the original reverted', async () => {
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db)

    await accept(db, revert)

    expect(await blocksOf(db, pageId)).toEqual(BEFORE)
    expect(await statusOf(db, revert)).toBe('accepted')
    // The edge the design's frame 4 only ever walks on accept — while the revert
    // was merely proposed, the original read `accepted` and the record page showed
    // it as a `reverted by` FIELD, not a status.
    expect(await statusOf(db, original)).toBe('reverted')
    await db.close()
  })

  it('appends exactly one transition to each record, naming where it landed', async () => {
    const db = await makeDb()
    const { original, revert } = await scene(db)

    await accept(db, revert)

    const rows = await db.query<{ id: string; transitions: { status: string; actor: string }[] }>(
      'select id, transitions from public.change_log where id = any($1)',
      [[original, revert]]
    )
    const byId = new Map(rows.rows.map((r) => [r.id, r.transitions]))
    expect(byId.get(revert)?.map((t) => t.status)).toEqual(['proposed', 'accepted'])
    expect(byId.get(original)?.map((t) => t.status)).toEqual(['accepted', 'reverted'])
    await db.close()
  })

  it('returns the advanced revert record', async () => {
    const db = await makeDb()
    const { revert } = await scene(db)

    const res = await accept(db, revert)

    expect((res.rows[0] as { id: string; status: string }).id).toBe(revert)
    expect((res.rows[0] as { id: string; status: string }).status).toBe('accepted')
    await db.close()
  })
})

// ── Preconditions, each of which must leave the page untouched ───────────────

describe('accept_revert_record — refusals are atomic', () => {
  it('refuses an outdated revert — its accept affordance is withdrawn', async () => {
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db, { revertStatus: 'outdated' })

    await expect(accept(db, revert)).rejects.toThrow(/only a proposed revert/)

    expect(await blocksOf(db, pageId)).toEqual(AFTER)
    expect(await statusOf(db, original)).toBe('accepted')
    await db.close()
  })

  it('refuses a record that is not a revert at all', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pageId = await addPage(db)
    const edit = await addRecord(db, { status: 'proposed', action: 'edit', pageId })

    await expect(accept(db, edit)).rejects.toThrow(/is a edit, not a revert/)
    expect(await blocksOf(db, pageId)).toEqual(AFTER)
    await db.close()
  })

  it('refuses a revert carrying no revert_of link', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pageId = await addPage(db)
    const revert = await addRecord(db, { status: 'proposed', action: 'revert', pageId, links: {} })

    await expect(accept(db, revert)).rejects.toThrow(/revert with no revert_of link/)
    expect(await blocksOf(db, pageId)).toEqual(AFTER)
    await db.close()
  })

  it('reports a malformed link rather than failing on the cast', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    const pageId = await addPage(db)
    const revert = await addRecord(db, {
      status: 'proposed',
      action: 'revert',
      pageId,
      links: { revert_of: 'not-a-uuid' },
    })

    await expect(accept(db, revert)).rejects.toThrow(/is not a record id/)
    await db.close()
  })

  it('refuses when the record it reverts is no longer accepted', async () => {
    // `accepted → reverted` is the only edge out of `accepted`, so anything else
    // means the change was already taken back — by another revert, or by #104's undo.
    const db = await makeDb()
    const { pageId, revert } = await scene(db, { originalStatus: 'undone' })

    await expect(accept(db, revert)).rejects.toThrow(/is undone, not accepted/)
    expect(await blocksOf(db, pageId)).toEqual(AFTER)
    await db.close()
  })

  it('refuses a link that reaches into another pond', async () => {
    // Per-pond separation (criterion 11). RLS confines the reads, but this
    // function is reached by id and would otherwise advance a record in a
    // workspace the revert does not belong to.
    const db = await makeDb()
    await seedUser(db, USER)
    const pageId = await addPage(db)
    const elsewhere = await addRecord(db, {
      workspace: 'sandbox',
      status: 'accepted',
      action: 'edit',
    })
    const revert = await addRecord(db, {
      status: 'proposed',
      action: 'revert',
      pageId,
      links: { revert_of: elsewhere },
    })

    await expect(accept(db, revert)).rejects.toThrow(/in another pond/)
    expect(await statusOf(db, elsewhere)).toBe('accepted')
    await db.close()
  })

  it('refuses when the target page is gone, leaving both records alone', async () => {
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db)
    // ON DELETE SET NULL — the record outlives the page.
    await db.query('delete from public.pages where id = $1', [pageId])

    await expect(accept(db, revert)).rejects.toThrow(/no target page/)
    expect(await statusOf(db, revert)).toBe('proposed')
    expect(await statusOf(db, original)).toBe('accepted')
    await db.close()
  })
})

// ── The compare-and-swap on the page ─────────────────────────────────────────

describe('accept_revert_record — the page compare-and-swap', () => {
  it('refuses when the page changed underneath the plan, writing nothing', async () => {
    // The caller plans OUTSIDE this transaction, and not every writer of
    // pages.blocks leaves a log record — a person typing saves through the
    // ordinary debounced path, which logs nothing today. Without this check, a
    // revert accepted a moment later would write a block array computed from a
    // page that no longer existed and silently drop what they wrote.
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db)
    const typed = [{ id: 'a', type: 'text', content: 'ONE' }, { id: 'z', type: 'text', content: 'typed just now' }] // prettier-ignore
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify(typed),
      pageId,
    ])

    await expect(accept(db, revert)).rejects.toThrow(/changed underneath the revert/)

    expect(await blocksOf(db, pageId)).toEqual(typed)
    expect(await statusOf(db, revert)).toBe('proposed')
    expect(await statusOf(db, original)).toBe('accepted')
    await db.close()
  })

  it('accepts when the caller re-plans against what the page now holds', async () => {
    // The recovery path: re-read, re-plan, try again. The typed block survives
    // because only the blocks the original touched are set back.
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db)
    const typed = [{ id: 'a', type: 'text', content: 'ONE' }, { id: 'z', type: 'text', content: 'typed just now' }] // prettier-ignore
    const replanned = [{ id: 'a', type: 'text', content: 'one' }, { id: 'z', type: 'text', content: 'typed just now' }] // prettier-ignore
    await db.query('update public.pages set blocks = $1 where id = $2', [
      JSON.stringify(typed),
      pageId,
    ])

    await accept(db, revert, typed, replanned)

    expect(await blocksOf(db, pageId)).toEqual(replanned)
    expect(await statusOf(db, original)).toBe('reverted')
    await db.close()
  })

  it('is not fooled by JSONB key order', async () => {
    // pages.blocks round-trips through JSONB, which stores keys in its own order.
    // A textual comparison would refuse every accept; `is distinct from` on jsonb
    // compares by value.
    const db = await makeDb()
    const { pageId, revert } = await scene(db)
    const reordered = [{ content: 'ONE', type: 'text', id: 'a' }]

    await accept(db, revert, reordered)

    expect(await blocksOf(db, pageId)).toEqual(BEFORE)
    await db.close()
  })
})

// ── Only-grows still holds ───────────────────────────────────────────────────

describe('accept_revert_record — the log still only grows', () => {
  it('rewrites no diff content on either record', async () => {
    const db = await makeDb()
    const { original, revert } = await scene(db)

    await accept(db, revert)

    const rows = await db.query<{ id: string; before: unknown; after: unknown }>(
      'select id, "before", "after" from public.change_log where id = any($1)',
      [[original, revert]]
    )
    const byId = new Map(rows.rows.map((r) => [r.id, r]))
    expect(byId.get(original)).toMatchObject({ before: BEFORE, after: AFTER })
    expect(byId.get(revert)).toMatchObject({ before: AFTER, after: BEFORE })
    await db.close()
  })

  it('leaves a second accept of the same revert with nothing to do', async () => {
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db)
    await accept(db, revert)

    // The revert is `accepted` now, so the proposed-only guard turns the replay
    // into a refusal rather than a second page write.
    await expect(accept(db, revert)).rejects.toThrow(/only a proposed revert/)
    expect(await blocksOf(db, pageId)).toEqual(BEFORE)
    expect(await statusOf(db, original)).toBe('reverted')
    await db.close()
  })

  it('does not let a revert of a revert reach back past the append-only trigger', async () => {
    // A revert is itself an accepted record once it lands, so #103 makes reverts
    // of reverts reachable. The chain must stay ordinary: the second revert marks
    // the FIRST one reverted, and never touches the change at the root.
    const db = await makeDb()
    const { pageId, original, revert } = await scene(db)
    await accept(db, revert)

    const second = await addRecord(db, {
      status: 'proposed',
      action: 'revert',
      pageId,
      before: BEFORE,
      after: AFTER,
      links: { revert_of: revert },
    })
    await accept(db, second, BEFORE, AFTER)

    expect(await blocksOf(db, pageId)).toEqual(AFTER)
    expect(await statusOf(db, second)).toBe('accepted')
    expect(await statusOf(db, revert)).toBe('reverted')
    // Still `reverted` from the first round — not re-advanced, not rewritten.
    expect(await statusOf(db, original)).toBe('reverted')
    await db.close()
  })
})
