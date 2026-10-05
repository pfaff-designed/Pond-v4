/**
 * FEATURE: ponds — the whole path, end to end (#312, `Pond 06.13 Create a pond`).
 *
 * Two outcomes a person can see, and nothing else:
 *
 *   1. `s6m5` frame 5 — "the shell opens on the new pond's root page", and that
 *      pond is EMPTY. Not a copy of the pond you made it from, and not `life`:
 *      #320 says "a pond is born with one row, its root, titled with the pond's
 *      own name."
 *   2. `s6m5` again — "pages, databases, memory, threads and the change log are
 *      per pond. **Nothing crosses over.**" Four scopes, one table.
 *
 * These drive the real reads the four surfaces call — `fetchPages`,
 * `getOrCreateConversation`, `listRecords`, `listTemplates` — against ONE
 * in-memory database that actually applies the filters, so isolation is proved
 * by the rows that come back rather than by spying on `.eq(…)` calls. That is
 * the difference that matters here: every one of these bugs shipped green,
 * because a query that asks for the wrong pond is still a well-formed query.
 *
 * Why not `helpers/fake-supabase.ts`: that harness is the pages table only and
 * its builder has no `.order`, `.neq` or `.limit`, which three of these four
 * reads need. Extending it would touch a file four other slices are mid-edit on,
 * so the multi-table double lives here. If a second feature test needs it, lift
 * it into the helper then.
 *
 * Deliberately NOT here: the sheet's own three steps (`pond-switcher.test.tsx`
 * owns that surface), the migration's backfill and indexes (`ponds.pglite`), and
 * `resolveActivePond`'s null-not-first rule (`pond-active`).
 */

import { createPond } from '@/lib/pond/client'
import { getOrCreateHomePage, HOME_TYPE } from '@/lib/pages/home'
import { fetchPages } from '@/lib/pages/tree'
import { getOrCreateConversation } from '@/lib/conversation/client'
import { listRecords } from '@/lib/change-log/store'
import { listTemplates } from '@/lib/templates/client'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
import { createClient } from '@/lib/supabase/client'

const USER = 'user-1'
const LIFE = 'p-life'
const NOISE = 'p-noise'

// ── One in-memory database, four tables ──────────────────────────────────────

type Row = Record<string, unknown>

interface Builder extends PromiseLike<{ data: Row[]; error: null }> {
  select: (...args: unknown[]) => Builder
  insert: (payload: Row) => Builder
  eq: (col: string, val: unknown) => Builder
  neq: (col: string, val: unknown) => Builder
  is: (col: string, val: unknown) => Builder
  in: (col: string, vals: unknown[]) => Builder
  order: (col: string, opts?: { ascending?: boolean }) => Builder
  limit: (n: number) => Builder
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
  single: () => Promise<{ data: Row | null; error: null }>
}

function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }))
  let seq = 0

  const from = (table: string): Builder => {
    tables[table] ??= []
    const filters: Array<(r: Row) => boolean> = []
    let inserting: Row | null = null
    let sort: { col: string; asc: boolean } | null = null
    let cap: number | null = null

    const matching = (): Row[] => {
      let rows = tables[table].filter((r) => filters.every((f) => f(r)))
      if (sort) {
        const { col, asc } = sort
        rows = [...rows].sort((a, b) => {
          const [x, y] = [a[col], b[col]]
          if (x === y) return 0
          return ((x as number | string) > (y as number | string) ? 1 : -1) * (asc ? 1 : -1)
        })
      }
      return cap === null ? rows : rows.slice(0, cap)
    }

    const builder: Builder = {
      select: () => builder,
      insert: (payload) => {
        inserting = payload
        return builder
      },
      eq: (col, val) => {
        filters.push((r) => r[col] === val)
        return builder
      },
      neq: (col, val) => {
        filters.push((r) => r[col] !== val)
        return builder
      },
      is: (col, val) => {
        filters.push((r) => (r[col] ?? null) === val)
        return builder
      },
      in: (col, vals) => {
        filters.push((r) => vals.includes(r[col]))
        return builder
      },
      order: (col, opts) => {
        sort = { col, asc: opts?.ascending !== false }
        return builder
      },
      limit: (n) => {
        cap = n
        return builder
      },
      maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
      single: () => {
        if (inserting) {
          const created: Row = { id: `${table}-${++seq}`, ...inserting }
          tables[table].push(created)
          return Promise.resolve({ data: created, error: null })
        }
        return Promise.resolve({ data: matching()[0] ?? null, error: null })
      },
      then: (resolve) => Promise.resolve({ data: matching(), error: null }).then(resolve) as never,
    }
    return builder
  }

  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER } } }) },
    from: jest.fn(from),
    _tables: tables,
  }
}

type Db = ReturnType<typeof makeDb>

/** A person with two ponds, each holding one row in all four scopes. */
function twoPonds(): Db {
  const page = (id: string, pond: string, title: string, type = 'page'): Row => ({
    id,
    user_id: USER,
    pond_id: pond,
    parent_id: null,
    type,
    title,
    blocks: [],
    props: {},
    order: 0,
    updated_at: '2026-01-01T00:00:00.000Z',
    glyph: null,
    area_role: null,
  })
  const said = (text: string) => ({
    messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text }] }],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  })
  const logRow = (id: string, pond: string): Row => ({
    id,
    user_id: USER,
    pond_id: pond,
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    target_page_id: null,
    target_block_id: null,
    before: null,
    after: null,
    source_thread_id: null,
    tool_call_id: null,
    read: null,
    links: {},
    transitions: [],
    created_at: '2026-01-01T00:00:00.000Z',
    status_at: '2026-01-01T00:00:00.000Z',
  })
  const template = (id: string, pond: string, name: string): Row => ({
    id,
    user_id: USER,
    pond_id: pond,
    name,
    kind: 'page',
    blocks: [],
    origin: 'yours',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  })

  return makeDb({
    ponds: [
      { id: LIFE, user_id: USER, name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 },
      { id: NOISE, user_id: USER, name: 'make noise', glyph: null, theme: 'ink', order: 1 },
    ],
    pages: [
      page('life-root', LIFE, 'life', HOME_TYPE),
      page('noise-root', NOISE, 'make noise', HOME_TYPE),
      page('page-notes', LIFE, 'notes'),
      page('page-riffs', NOISE, 'riffs'),
    ],
    conversations: [
      // The noise thread is NEWER on purpose: an unscoped "most recent thread"
      // read returns it, which is exactly the bug #312 closed.
      {
        id: 'conv-life',
        user_id: USER,
        pond_id: LIFE,
        dissolved_at: null,
        transcript: said('where did i put the keys'),
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'conv-noise',
        user_id: USER,
        pond_id: NOISE,
        dissolved_at: null,
        transcript: said('what rhymes with pond'),
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    change_log: [logRow('log-life', LIFE), logRow('log-noise', NOISE)],
    templates: [
      template('tpl-life', LIFE, 'weekly review'),
      template('tpl-noise', NOISE, 'set list'),
    ],
  })
}

let db: Db

beforeEach(() => {
  db = twoPonds()
  ;(createClient as jest.Mock).mockImplementation(() => db)
})

/**
 * The four scopes `s6m5` names, each read the way its surface reads it and each
 * projected down to what the person actually sees: page titles in the rail, the
 * words in the composer transcript, the records in the proposed view, the names
 * in the template picker.
 */
const SCOPES: Array<{
  scope: string
  read: (pondId: string | null | undefined) => Promise<string[]>
  inLife: string[]
  inNoise: string[]
}> = [
  {
    scope: 'the page tree',
    read: async (pondId) => (await fetchPages(pondId)).map((r) => r.title),
    inLife: ['notes'],
    inNoise: ['riffs'],
  },
  {
    scope: 'the composer thread',
    read: async (pondId) => {
      const thread = await getOrCreateConversation(db as never, USER, pondId)
      return thread.messages.flatMap((m) =>
        (m.parts ?? []).map((p) => ('text' in p ? String(p.text) : ''))
      )
    },
    inLife: ['where did i put the keys'],
    inNoise: ['what rhymes with pond'],
  },
  {
    scope: 'the change log',
    read: async (pondId) =>
      (await listRecords(db as never, { userId: USER, pondId })).map((r) => r.id),
    inLife: ['log-life'],
    inNoise: ['log-noise'],
  },
  {
    scope: 'templates',
    read: async (pondId) => (await listTemplates(db as never, USER, pondId)).map((t) => t.name),
    inLife: ['weekly review'],
    inNoise: ['set list'],
  },
]

// ── 1. A new pond is a new, empty pond ───────────────────────────────────────

describe('creating a pond', () => {
  it('opens on its OWN root, named after itself, with all four scopes empty', async () => {
    const pond = await createPond('red door guys')

    // Its own row, in switcher order after the two that existed (`s6m2`).
    expect(pond.name).toBe('red door guys')
    expect(pond.order).toBe(2)

    // `#320`: born with ONE row — its root, titled with the pond's own name.
    // Titling it `life` is the regression this pins: it is what every pond's
    // root read before the pond name was threaded through, and it looks like a
    // working app right up to the moment you notice two ponds called life.
    const root = await getOrCreateHomePage(db as never, pond.id, pond.name)
    expect(root?.title).toBe('red door guys')
    expect(root?.blocks).toEqual([])
    expect(root?.id).not.toBe('life-root')

    // And it is a NEW row, not life's root handed back under a new name.
    const roots = (db._tables.pages as Row[]).filter((r) => r.type === HOME_TYPE)
    expect(roots.map((r) => r.title).sort()).toEqual(['life', 'make noise', 'red door guys'])

    // Everything a person would see on opening it: nothing. The root is stripped
    // from the tree, so the rail is empty too — not the pond they made it from.
    for (const { read } of SCOPES) expect(await read(pond.id)).toEqual([])

    // The pond it was made from is untouched.
    expect(await fetchPages(LIFE)).toHaveLength(1)
  })

  it('gives the new pond a thread of its own rather than carrying one over', async () => {
    // The shipped bug: the composer opened the person's most recent thread
    // whatever pond they were in, so a brand-new pond came up holding the last
    // conversation — with read chips pointing at pages it cannot see.
    const pond = await createPond('red door guys')

    const thread = await getOrCreateConversation(db as never, USER, pond.id)

    expect(thread.messages).toEqual([])
    expect(['conv-life', 'conv-noise']).not.toContain(thread.id)
  })
})

// ── 2. Switching pond isolates all four scopes ───────────────────────────────

describe('switching pond', () => {
  it.each(SCOPES)('$scope shows only the pond you are in', async ({ read, inLife, inNoise }) => {
    expect(await read(LIFE)).toEqual(inLife)
    expect(await read(NOISE)).toEqual(inNoise)
  })

  /**
   * The high-risk edge, and the reason it earns a place: a surface rendered
   * outside the shell's `PondProvider` names no pond, and both of these fall
   * back to the person's FIRST pond. If that fallback ever resolves to nothing,
   * the pond filter is dropped and the read spans every pond — with no error,
   * no empty state and nothing going red. The change log and templates read
   * across ponds by design when unscoped, so they are not in this pair.
   */
  it.each(SCOPES.slice(0, 2))(
    '$scope falls back to the FIRST pond when none is named, never across ponds',
    async ({ read, inLife }) => {
      expect(await read(undefined)).toEqual(inLife)
    }
  )
})
