/**
 * Pond scope isolation (#312).
 *
 * This file was `sandbox-scope.test.ts` and asserted the `workspace` column's
 * main/sandbox isolation across `getChildPages`, `listPages`, `createPage` and
 * `fetchPages`. Migration 0020 retired that column: #315 ruled the sandbox
 * becomes a POND, and 0018's backfill made it one. Per-pond isolation is the same
 * guarantee under a different key, so what survives here is the `fetchPages`
 * scoping — including the case that used to FAIL, where the route said `main` and
 * the pond said sandbox.
 *
 * The unscoped reads those other describes covered are a real remaining gap, not a
 * solved one: `getChildPages` and `listPages` still filter by person alone. They
 * are named on #312 rather than asserted here, because asserting the current
 * behaviour would lock in the leak.
 */

import { fetchPages } from '@/lib/pages/tree'

// ── Chain mock helpers (mirrors pages-client.test.ts) ────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { id: 'page-1' }, error: null }),
    ...overrides,
  }
  return chain
}

function makeSupabase(chain = makeChain()) {
  return {
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

// ── getChildPages scope ───────────────────────────────────────────────────────

// `fetchPages` constructs its own client via `createClient()`; mock that module.
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
  function primeClient(byPond: Record<string, unknown[]>) {
    const eqCalls: Array<[string, unknown]> = []
    let pond = 'none'
    const chain: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn((col: string, val: unknown) => {
        eqCalls.push([col, val])
        if (col === 'pond_id') pond = val as string
        return chain
      }),
      neq: jest.fn(() => chain),
      order: jest.fn(() => Promise.resolve({ data: byPond[pond] ?? [], error: null })),
      limit: jest.fn(() => chain),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
    }
    ;(createClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    })
    return { eqCalls }
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
    // A surface outside the shell\'s PondProvider. `firstPondId` answers from the
    // `ponds` table; this double returns none, so the read is unscoped rather than
    // returning every pond\'s pages.
    const { eqCalls } = primeClient({ none: [row('m1', 'Real')] })

    const rows = await fetchPages()

    expect(rows.map((r) => r.id)).toEqual(['m1'])
    expect(eqCalls).toContainEqual(['user_id', 'user-1'])
  })
})
