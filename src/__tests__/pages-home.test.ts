/**
 * The Life home page data layer (ticket-44).
 *
 * getOrCreateHomePage returns the reserved per-user `home` row, creating it on
 * first access and being idempotent under a create race. The row must NOT leak
 * into the ['pages'] tree the rail reads — fetchPages strips it — so Life's own
 * blocks never become a rail child.
 */

import { getOrCreateHomePage, HOME_TYPE } from '@/lib/pages/home'

// ── A tiny in-memory Supabase-ish double for the pages table ─────────────────
// Enough surface for home.ts: auth.getUser, a filtered maybeSingle read, and an
// insert().select().single(). The query builder is chainable and terminal on
// `maybeSingle` / `single`.

interface Row {
  id: string
  user_id: string
  pond_id?: string
  parent_id: string | null
  type: string
  title: string
  blocks: unknown
}

function makeSupabase(opts: {
  user: { id: string } | null
  rows?: Row[]
  failInsert?: boolean
  /** A row that only becomes visible AFTER a (failed) insert — the race winner. */
  winnerAfterInsert?: Row
}) {
  const rows: Row[] = opts.rows ?? []
  let nextId = 1
  const inserts: Row[] = []
  let insertAttempted = false

  const table = () => {
    const filters: Array<(r: Row) => boolean> = []
    const builder: Record<string, unknown> = {
      select() {
        return builder
      },
      eq(col: string, val: unknown) {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
        return builder
      },
      limit() {
        return builder
      },
      maybeSingle() {
        const pool =
          opts.winnerAfterInsert && insertAttempted ? [...rows, opts.winnerAfterInsert] : rows
        const hit = pool.find((r) => filters.every((f) => f(r)))
        return Promise.resolve({ data: hit ?? null, error: null })
      },
      insert(payload: Omit<Row, 'id'>) {
        return {
          select() {
            return {
              single() {
                insertAttempted = true
                if (opts.failInsert) {
                  return Promise.resolve({ data: null, error: { message: 'duplicate' } })
                }
                const created: Row = { id: `home-${nextId++}`, ...payload }
                rows.push(created)
                inserts.push(created)
                return Promise.resolve({ data: created, error: null })
              },
            }
          },
        }
      },
    }
    return builder
  }

  return {
    _inserts: inserts,
    auth: { getUser: () => Promise.resolve({ data: { user: opts.user } }) },
    from: () => table(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

/** #312: the root is per pond, so every call names one. */
const POND = 'pond-1'

describe('getOrCreateHomePage', () => {
  it('returns null when unauthenticated', async () => {
    const sb = makeSupabase({ user: null })
    expect(await getOrCreateHomePage(sb, POND)).toBeNull()
  })

  it('creates the reserved home row on first access (empty blocks)', async () => {
    const sb = makeSupabase({ user: { id: 'u1' }, rows: [] })
    const home = await getOrCreateHomePage(sb, POND)
    expect(home).not.toBeNull()
    expect(home!.title).toBe('Untitled')
    expect(home!.blocks).toEqual([])
    // Exactly one insert, of the reserved type at top-level.
    expect(sb._inserts).toHaveLength(1)
    expect(sb._inserts[0].type).toBe(HOME_TYPE)
    expect(sb._inserts[0].parent_id).toBeNull()
  })

  it('reuses the existing home row (idempotent, no second insert)', async () => {
    const existing: Row = {
      id: 'home-existing',
      user_id: 'u1',
      // #312: a root belongs to a pond, and `readHomeRow` filters on it.
      pond_id: POND,
      parent_id: null,
      type: HOME_TYPE,
      title: 'Life',
      blocks: [{ id: 'b1', type: 'text', content: 'welcome' }],
    }
    const sb = makeSupabase({ user: { id: 'u1' }, rows: [existing] })
    const home = await getOrCreateHomePage(sb, POND)
    expect(home!.id).toBe('home-existing')
    expect(home!.blocks).toHaveLength(1)
    expect(sb._inserts).toHaveLength(0)
  })

  it('re-reads the winner when the create races (unique-index failure)', async () => {
    // First read finds nothing; the insert fails (lost the race to the unique
    // index); the winning row — inserted by the concurrent tab — is present for
    // the re-read. We model that by mutating the shared rows array on insert.
    const winner: Row = {
      id: 'home-winner',
      user_id: 'u1',
      // #312: a root belongs to a pond, and `readHomeRow` filters on it.
      pond_id: POND,
      parent_id: null,
      type: HOME_TYPE,
      title: 'Life',
      blocks: [],
    }
    const sb = makeSupabase({
      user: { id: 'u1' },
      rows: [],
      failInsert: true,
      // Only visible after the insert is attempted — the concurrent winner.
      winnerAfterInsert: winner,
    })
    const home = await getOrCreateHomePage(sb, POND)
    expect(home!.id).toBe('home-winner')
    expect(sb._inserts).toHaveLength(0)
  })
})
