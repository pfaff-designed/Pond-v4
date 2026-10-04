/**
 * ticket-43 — sandbox workspace isolation.
 *
 * Proves the `workspace` discriminator threads correctly through the page reads
 * and writes, so a sandbox row never surfaces in a 'main' query and vice-versa,
 * and that the reset path wipes + re-seeds the sandbox fixture.
 *
 * Uses the same mocked-chain approach as pages-client.test.ts — no live Supabase.
 * The core guarantee is a data-scope contract: every scoped query calls
 * .eq('workspace', <scope>), and no query mixes scopes.
 */

import { getChildPages, listPages, createPage } from '@/lib/pages/client'
import { fetchPages } from '@/lib/pages/tree'
import { resetSandbox, SANDBOX_FIXTURE } from '@/lib/sandbox/reset'

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

/** Every workspace value the query chain was scoped to, in call order. */
function workspaceArgs(chain: ReturnType<typeof makeChain>): string[] {
  return (chain.eq as jest.Mock).mock.calls.filter((c) => c[0] === 'workspace').map((c) => c[1])
}

// ── getChildPages scope ───────────────────────────────────────────────────────

describe('getChildPages scope isolation', () => {
  it("filters to the 'main' scope by default", async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)

    await getChildPages(sb as never, 'user-1', 'p1')

    expect(workspaceArgs(chain)).toEqual(['main'])
  })

  it("filters to the 'sandbox' scope when passed", async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)

    await getChildPages(sb as never, 'user-1', 'p1', 'sandbox')

    expect(workspaceArgs(chain)).toEqual(['sandbox'])
  })

  it('never mixes scopes in one query (main query has no sandbox filter)', async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)

    await getChildPages(sb as never, 'user-1', null, 'main')

    expect(workspaceArgs(chain)).not.toContain('sandbox')
  })
})

// ── listPages scope ───────────────────────────────────────────────────────────

describe('listPages scope isolation', () => {
  it("scopes the flat list to 'main' by default", async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)

    await listPages(sb as never, 'user-1')

    expect(workspaceArgs(chain)).toEqual(['main'])
  })

  it("scopes the flat list to 'sandbox' when passed", async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)

    await listPages(sb as never, 'user-1', 'sandbox')

    expect(workspaceArgs(chain)).toEqual(['sandbox'])
  })
})

// ── The isolation contract: a row of one scope never returns in the other ─────
// Modelled at the query layer: because every read carries .eq('workspace', scope),
// the DB returns only same-scope rows. We assert the filter is applied AND that
// the returned rows (as the DB would scope them) never cross over.

describe('cross-scope leakage is impossible at the query layer', () => {
  it('a sandbox row is not returned by a main query', async () => {
    // The DB, given .eq('workspace','main'), returns only main rows. We model
    // that: the mock returns only the rows matching the scope it was asked for.
    const allRows = [
      {
        id: 'm1',
        parent_id: null,
        type: 'page',
        title: 'Real Area',
        blocks: [],
        status: null,
        order: 0,
        workspace: 'main',
      },
      {
        id: 's1',
        parent_id: null,
        type: 'page',
        title: 'Sandbox Area A',
        blocks: [],
        status: null,
        order: 0,
        workspace: 'sandbox',
      },
    ]
    function scopedChain(scope: string) {
      return makeChain({
        order: jest.fn().mockResolvedValue({
          data: allRows.filter((r) => r.workspace === scope),
          error: null,
        }),
      })
    }

    const mainChain = scopedChain('main')
    const mainRows = await listPages(makeSupabase(mainChain) as never, 'user-1', 'main')
    expect(mainRows.map((r) => r.id)).toEqual(['m1'])
    expect(mainRows.map((r) => r.id)).not.toContain('s1')
    expect(workspaceArgs(mainChain)).toEqual(['main'])
  })

  it('a main row is not returned by a sandbox query', async () => {
    const allRows = [
      {
        id: 'm1',
        parent_id: null,
        type: 'page',
        title: 'Real Area',
        blocks: [],
        status: null,
        order: 0,
        workspace: 'main',
      },
      {
        id: 's1',
        parent_id: null,
        type: 'page',
        title: 'Sandbox Area A',
        blocks: [],
        status: null,
        order: 0,
        workspace: 'sandbox',
      },
    ]
    function scopedChain(scope: string) {
      return makeChain({
        order: jest.fn().mockResolvedValue({
          data: allRows.filter((r) => r.workspace === scope),
          error: null,
        }),
      })
    }

    const sandboxChain = scopedChain('sandbox')
    const sandboxRows = await listPages(makeSupabase(sandboxChain) as never, 'user-1', 'sandbox')
    expect(sandboxRows.map((r) => r.id)).toEqual(['s1'])
    expect(sandboxRows.map((r) => r.id)).not.toContain('m1')
    expect(workspaceArgs(sandboxChain)).toEqual(['sandbox'])
  })
})

// ── createPage stamps the workspace column ────────────────────────────────────

describe('createPage stamps the workspace column', () => {
  it("defaults the insert to 'main'", async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
    })
    const sb = makeSupabase(chain)

    await createPage(sb as never, 'user-1', { title: 'x' })

    const inserted = (chain.insert as jest.Mock).mock.calls[0][0]
    expect(inserted.workspace).toBe('main')
  })

  it("stamps 'sandbox' when the input carries it", async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
    })
    const sb = makeSupabase(chain)

    await createPage(sb as never, 'user-1', { title: 'x', workspace: 'sandbox' })

    const inserted = (chain.insert as jest.Mock).mock.calls[0][0]
    expect(inserted.workspace).toBe('sandbox')
  })

  it('a sandbox insert never carries workspace=main (no scope bleed)', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
    })
    const sb = makeSupabase(chain)

    await createPage(sb as never, 'user-1', { title: 'x', workspace: 'sandbox' })

    const inserted = (chain.insert as jest.Mock).mock.calls[0][0]
    expect(inserted.workspace).not.toBe('main')
  })
})

// ── fetchPages (the ['pages'] tree read) scope ───────────────────────────────
// fetchPages constructs its own client via createClient(); mock that module.

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}))
import { createClient } from '@/lib/supabase/client'

describe('fetchPages scope isolation', () => {
  /**
   * #312: the tree is scoped by POND, not by workspace.
   *
   * These asserted `.eq('workspace', …)` because that WAS the scope. It is not any
   * more: the sandbox pond holds exactly the `workspace='sandbox'` rows, so the
   * pond filter says everything the workspace filter said — and keeping both made
   * the sandbox pond unreachable, since `/workspace?pond=<sandbox>` asked for
   * `workspace='main'` AND the sandbox pond, which can never both match.
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

    const rows = await fetchPages('main', 'pond-life')

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
    const rows = await fetchPages('main', 'pond-sandbox')

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

// ── resetSandbox ──────────────────────────────────────────────────────────────

describe('resetSandbox', () => {
  it('calls the reset_sandbox RPC scoped to the user', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null })
    const sb = { rpc }

    await resetSandbox(sb as never, 'user-1')

    expect(rpc).toHaveBeenCalledWith('reset_sandbox', { p_user_id: 'user-1' })
  })

  it('throws when the RPC errors (so a failed reset is never silent)', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: { message: 'reset boom' } })
    const sb = { rpc }

    await expect(resetSandbox(sb as never, 'user-1')).rejects.toThrow(/reset boom/)
  })

  it('the fixture is exactly 2 areas + 1 demo page', () => {
    expect(SANDBOX_FIXTURE.areas).toHaveLength(2)
    expect(SANDBOX_FIXTURE.pages).toHaveLength(1)
    expect(SANDBOX_FIXTURE.areas).toEqual(['Sandbox Area A', 'Sandbox Area B'])
    expect(SANDBOX_FIXTURE.pages).toEqual(['Demo Page'])
  })
})
