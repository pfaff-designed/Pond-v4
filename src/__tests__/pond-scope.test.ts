/**
 * Pond scope isolation (#312, KAN-271).
 *
 * `Pond 06.13` `s6m5`: "pages, databases, memory, threads and the change log are
 * per pond. Nothing crosses over." Every read of a set of rows is confined with
 * `inPond`, and a reader that is not handed a pond reads the person's first —
 * never every pond.
 *
 * This file was `sandbox-scope.test.ts` and asserted the `workspace` column's
 * main/sandbox isolation. Migration 0020 retired that column: #315 ruled the
 * sandbox becomes a POND, and 0018's backfill made it one, so what survives is the
 * `fetchPages` scoping — including the case that used to FAIL, where the route
 * said `main` and the pond said sandbox.
 */

import { fetchPages } from '@/lib/pages/tree'
import { buildChatContext, resolveMention } from '@/lib/context/assemble'

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}))
import { createClient } from '@/lib/supabase/client'

describe('fetchPages scope isolation', () => {
  /**
   * #312: the tree is scoped by POND, and by nothing else.
   *
   * These asserted `.eq('workspace', …)` because that WAS the scope. The sandbox
   * pond holds exactly the rows the `workspace='sandbox'` filter used to return,
   * so the pond filter says everything the workspace filter said — and keeping
   * both made the sandbox pond unreachable, since `/workspace?pond=<sandbox>`
   * asked for `workspace='main'` AND the sandbox pond, which can never both
   * match. 0020 dropped the column.
   */
  function primeClient(byPond: Record<string, unknown[]>, firstPond: string | null = null) {
    const eqCalls: Array<[string, unknown]> = []
    const isCalls: Array<[string, unknown]> = []
    let pond = 'every pond'
    const pages: Record<string, jest.Mock> = {
      select: jest.fn(() => pages),
      eq: jest.fn((col: string, val: unknown) => {
        eqCalls.push([col, val])
        if (col === 'pond_id') pond = val as string
        return pages
      }),
      is: jest.fn((col: string, val: unknown) => {
        isCalls.push([col, val])
        if (col === 'pond_id') pond = 'no pond'
        return pages
      }),
      neq: jest.fn(() => pages),
      order: jest.fn(() => Promise.resolve({ data: byPond[pond] ?? [], error: null })),
    }
    const ponds: Record<string, jest.Mock> = {
      select: jest.fn(() => ponds),
      eq: jest.fn(() => ponds),
      order: jest.fn(() => ponds),
      limit: jest.fn(() => ponds),
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: firstPond ? { id: firstPond } : null, error: null })
      ),
    }
    ;(createClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: jest.fn((table: string) => (table === 'ponds' ? ponds : pages)),
    })
    return { eqCalls, isCalls }
  }

  const row = (id: string, title: string) => ({
    id,
    parent_id: null,
    type: 'page',
    title,
    order: 0,
    updated_at: 't',
  })

  it("returns only the named pond's rows", async () => {
    const { eqCalls } = primeClient({
      'pond-life': [row('m1', 'Real')],
      'pond-sandbox': [row('s1', 'SB')],
    })

    const rows = await fetchPages('pond-life')

    expect(rows.map((r) => r.id)).toEqual(['m1'])
    expect(eqCalls).toContainEqual(['pond_id', 'pond-life'])
    // The workspace filter is GONE — it is what made the sandbox pond unreachable.
    expect(eqCalls.map(([col]) => col)).not.toContain('workspace')
  })

  it("returns the sandbox POND's rows when that is the pond, whatever the route says", async () => {
    const { eqCalls } = primeClient({
      'pond-life': [row('m1', 'Real')],
      'pond-sandbox': [row('s1', 'SB')],
    })

    // `/workspace?pond=<sandbox pond>` — the combination that used to return
    // nothing, because the route said 'main' and the pond said sandbox.
    const rows = await fetchPages('pond-sandbox')

    expect(rows.map((r) => r.id)).toEqual(['s1'])
    expect(eqCalls).toContainEqual(['pond_id', 'pond-sandbox'])
  })

  it('falls back to the first pond when none is named', async () => {
    // A surface outside the shell's PondProvider: `firstPondId` answers from the
    // `ponds` table, and only that pond's pages come back.
    const { eqCalls } = primeClient(
      { 'pond-life': [row('m1', 'Real')], 'pond-sandbox': [row('s1', 'SB')] },
      'pond-life'
    )

    const rows = await fetchPages()

    expect(rows.map((r) => r.id)).toEqual(['m1'])
    expect(eqCalls).toContainEqual(['pond_id', 'pond-life'])
  })

  it('reads only pond-less rows for a person with no pond, never every pond’s', async () => {
    const { eqCalls, isCalls } = primeClient({
      'every pond': [row('m1', 'Real'), row('s1', 'SB')],
      'no pond': [row('n1', 'Unfiled')],
    })

    const rows = await fetchPages()

    expect(rows.map((r) => r.id)).toEqual(['n1'])
    expect(isCalls).toContainEqual(['pond_id', null])
    expect(eqCalls.map(([col]) => col)).not.toContain('pond_id')
  })
})

/** An in-memory table double: enough of PostgREST for the composer's reads. */
type Row = Record<string, unknown>
function makeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        return builder
      },
      is: (col: string, val: null) => {
        filters.push((r) => (r[col] ?? null) === val)
        return builder
      },
      ilike: (col: string, val: string) => {
        filters.push((r) => String(r[col]).toLowerCase() === val.toLowerCase())
        return builder
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]))
        return builder
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve),
    }
    return builder
  }
  return { from } as never
}

const page = (id: string, pond: string, title: string): Row => ({
  id,
  user_id: 'user-1',
  pond_id: pond,
  parent_id: null,
  type: 'page',
  title,
  blocks: [],
  props: {},
  order: 0,
})

describe('naming a page in the composer (KAN-271)', () => {
  // The same title in two ponds: unique per pond, so two different pages.
  const db = () =>
    makeDb({
      ponds: [
        { id: 'pond-life', user_id: 'user-1', order: 0 },
        { id: 'pond-life-2', user_id: 'user-1', order: 1 },
      ],
      pages: [
        page('life-personal', 'pond-life', 'personal'),
        page('life-2-personal', 'pond-life-2', 'Personal'),
        page('life-2-journal', 'pond-life-2', 'journal'),
      ],
    })

  it('resolves a name only among the asking pond’s pages', async () => {
    const sb = db()
    await expect(resolveMention(sb, 'user-1', 'personal', 'pond-life-2')).resolves.toMatchObject({
      nodeId: 'life-2-personal',
    })
    await expect(resolveMention(sb, 'user-1', 'personal', 'pond-life')).resolves.toMatchObject({
      nodeId: 'life-personal',
    })
  })

  it('finds nothing when only another pond has the name', async () => {
    await expect(resolveMention(db(), 'user-1', 'journal', 'pond-life')).resolves.toBeNull()
  })

  it('never hands the model another pond’s page, by mention or in the outline', async () => {
    const context = await buildChatContext(db(), 'user-1', {
      latestUserText: 'what is in @journal?',
      pondId: 'pond-life',
    })

    expect(context).not.toContain('Referenced: @journal')
    expect(context).not.toContain('journal')
    expect(context).toContain('personal')

    const own = await buildChatContext(db(), 'user-1', {
      latestUserText: 'what is in @journal?',
      pondId: 'pond-life-2',
    })
    expect(own).toContain('Referenced: @journal')
  })

  it('reads the first pond when the composer names none', async () => {
    const context = await buildChatContext(db(), 'user-1', { latestUserText: 'see @journal' })

    expect(context).not.toContain('journal')
  })
})
