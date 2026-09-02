/**
 * Unit tests for the unified page-tree persistence layer (src/lib/pages/client.ts).
 *
 * Mirrors the mocked-chain approach used in documents-client.test.ts — no live
 * Supabase. Verifies the CRUD + tree surface the sidebar, page editor, context
 * assembly, and semantic search build on:
 *   - getPage         (by id)
 *   - getChildPages   (direct children; null parent = top-level)
 *   - createPage      (under a parent or top-level)
 *   - saveBlocks      (entire block array written on save)
 *   - updateTitle     (rename)
 *   - deletePage      (subtree cascade handled by the FK)
 *   - matchPages      (match_pages RPC)
 */

import {
  getPage,
  getChildPages,
  listPages,
  createPage,
  saveBlocks,
  updateTitle,
  deletePage,
  movePage,
  matchPages,
  setProperty,
  defineSchema,
} from '@/lib/pages/client'
import type { Block } from '@/lib/documents/types'
import { SCHEMA_KEY, type PropertySchema } from '@/lib/properties/schema'

// ── Chain mock helpers ──────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { id: 'page-1' }, error: null }),
    then: undefined as unknown,
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

const sampleBlocks: Block[] = [
  { id: 'b1', type: 'text', content: '# Notes' },
  { id: 'b2', type: 'todo', items: [{ id: 'i1', label: 'Do thing', checked: false }] },
  { id: 'b3', type: 'metric', label: 'MRR', value: 500, unit: '$', trend: 'up' },
]

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-1',
    parent_id: null,
    type: 'area',
    title: 'Health',
    blocks: sampleBlocks,
    status: null,
    order: 0,
    ...overrides,
  }
}

// ── getPage ──────────────────────────────────────────────────────────────────

describe('getPage', () => {
  it('returns a single page by id', async () => {
    const chain = makeChain({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: pageRow({ parent_id: 'root-1' }), error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getPage(sb as never, 'page-1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
    expect(result).not.toBeNull()
    expect(result!.parentId).toBe('root-1')
    expect(result!.type).toBe('area')
    expect(result!.blocks).toEqual(sampleBlocks)
  })

  it('returns null when no page is found', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)
    expect(await getPage(sb as never, 'missing')).toBeNull()
  })

  it('coerces a null/invalid blocks column to an empty array', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: pageRow({ blocks: null }), error: null }),
    })
    const sb = makeSupabase(chain)
    const result = await getPage(sb as never, 'page-1')
    expect(result!.blocks).toEqual([])
  })

  it('reads props and coerces a null/array props column to an empty object', async () => {
    const withProps = makeChain({
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: pageRow({ props: { count: 3 } }), error: null }),
    })
    expect((await getPage(makeSupabase(withProps) as never, 'page-1'))!.props).toEqual({ count: 3 })

    const badProps = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: pageRow({ props: null }), error: null }),
    })
    expect((await getPage(makeSupabase(badProps) as never, 'page-1'))!.props).toEqual({})
  })
})

// ── getChildPages ────────────────────────────────────────────────────────────

describe('getChildPages', () => {
  it('fetches children of a parent with eq(parent_id)', async () => {
    const rows = [pageRow({ id: 'c1', parent_id: 'p1', type: 'page', title: 'Sub' })]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getChildPages(sb as never, 'user-1', 'p1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('parent_id', 'p1')
    expect(chain.is).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
    expect(result[0].parentId).toBe('p1')
  })

  it('uses is(null) for top-level pages when parentId is null', async () => {
    const rows = [pageRow({ id: 'a1', parent_id: null })]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getChildPages(sb as never, 'user-1', null)

    expect(chain.is).toHaveBeenCalledWith('parent_id', null)
    expect(result[0].parentId).toBeNull()
  })

  it('returns an empty array when there are no children', async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)
    expect(await getChildPages(sb as never, 'user-1', 'p1')).toEqual([])
  })
})

// ── listPages ─────────────────────────────────────────────────────────────────

describe('listPages', () => {
  it("returns the user's pages as a flat list ordered by order", async () => {
    const rows = [
      pageRow({ id: 'a1', parent_id: null, type: 'area', title: 'Personal' }),
      pageRow({ id: 'c1', parent_id: 'a1', type: 'page', title: 'Reading goals' }),
    ]
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: rows, error: null }) })
    const sb = makeSupabase(chain)

    const result = await listPages(sb as never, 'user-1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'a1', title: 'Personal', parentId: null })
    expect(result[1]).toMatchObject({ id: 'c1', title: 'Reading goals', parentId: 'a1' })
  })

  it('returns [] when the user has no pages', async () => {
    const chain = makeChain({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })
    const sb = makeSupabase(chain)
    expect(await listPages(sb as never, 'user-1')).toEqual([])
  })
})

// ── createPage ───────────────────────────────────────────────────────────────

describe('createPage', () => {
  it('inserts a child page with user_id, parent_id and type', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'page-new' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createPage(sb as never, 'user-1', {
      parentId: 'parent-1',
      type: 'page',
      title: 'Sub-page',
      blocks: sampleBlocks,
    })

    expect(sb.from).toHaveBeenCalledWith('pages')
    const inserted = chain.insert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      user_id: 'user-1',
      parent_id: 'parent-1',
      type: 'page',
      title: 'Sub-page',
      blocks: sampleBlocks,
    })
    expect(result.id).toBe('page-new')
    expect(result.parentId).toBe('parent-1')
    expect(result.blocks).toEqual(sampleBlocks)
  })

  it('creates a top-level page (null parent) with sensible defaults', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'page-top' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createPage(sb as never, 'user-1', {})

    const inserted = chain.insert.mock.calls[0][0]
    expect(inserted.user_id).toBe('user-1')
    expect(inserted.parent_id ?? null).toBeNull()
    expect(inserted.type).toBe('page')
    expect(inserted.blocks).toEqual([])
    expect(inserted.props).toEqual({})
    expect(result.id).toBe('page-top')
    expect(result.parentId).toBeNull()
  })

  it('throws when the insert fails', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    })
    const sb = makeSupabase(chain)
    await expect(createPage(sb as never, 'user-1', {})).rejects.toThrow(/boom/)
  })
})

// ── saveBlocks / updateTitle ─────────────────────────────────────────────────

describe('saveBlocks', () => {
  it('writes the entire block array to pages and bumps updated_at', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await saveBlocks(sb as never, 'page-1', sampleBlocks)

    expect(sb.from).toHaveBeenCalledWith('pages')
    const updated = chain.update.mock.calls[0][0]
    expect(updated.blocks).toEqual(sampleBlocks)
    expect(typeof updated.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('throws when the update errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
    })
    const sb = makeSupabase(chain)
    await expect(saveBlocks(sb as never, 'page-1', [])).rejects.toThrow(/nope/)
  })
})

describe('updateTitle', () => {
  it('updates the title for a page', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await updateTitle(sb as never, 'page-1', 'Renamed')

    const updated = chain.update.mock.calls[0][0]
    expect(updated.title).toBe('Renamed')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })
})

// ── deletePage ───────────────────────────────────────────────────────────────

describe('deletePage', () => {
  it('deletes a page by id (subtree cascade handled by the FK)', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await deletePage(sb as never, 'page-1')

    expect(sb.from).toHaveBeenCalledWith('pages')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('throws when the delete errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'del boom' } }),
    })
    const sb = makeSupabase(chain)
    await expect(deletePage(sb as never, 'page-1')).rejects.toThrow(/del boom/)
  })
})

// ── movePage ─────────────────────────────────────────────────────────────────

describe('movePage', () => {
  it('sets parent_id on the moved row then reindexes the sibling group order', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await movePage(sb as never, {
      id: 'x',
      newParentId: 'health',
      siblingOrder: ['a', 'x', 'b'],
    })

    // first update = the moved row's parent
    const parentUpdate = chain.update.mock.calls[0][0]
    expect(parentUpdate.parent_id).toBe('health')
    expect(typeof parentUpdate.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'x')

    // then one order update per id, dense 0..N-1
    const orderUpdates = chain.update.mock.calls.slice(1).map((c) => c[0])
    expect(orderUpdates).toEqual([{ order: 0 }, { order: 1 }, { order: 2 }])
    expect(chain.eq).toHaveBeenCalledWith('id', 'a')
    expect(chain.eq).toHaveBeenCalledWith('id', 'b')
  })

  it('moves a page to top-level with a null parent_id', async () => {
    const chain = makeChain({ eq: jest.fn().mockResolvedValue({ data: null, error: null }) })
    const sb = makeSupabase(chain)

    await movePage(sb as never, { id: 'x', newParentId: null, siblingOrder: ['x'] })

    expect(chain.update.mock.calls[0][0].parent_id).toBeNull()
  })

  it('throws when the parent update fails', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'move boom' } }),
    })
    const sb = makeSupabase(chain)
    await expect(
      movePage(sb as never, { id: 'x', newParentId: null, siblingOrder: ['x'] })
    ).rejects.toThrow(/move boom/)
  })
})

// ── setProperty / defineSchema (#17, merge-safe props writes) ─────────────────

const SCHEMA: PropertySchema = [
  { id: 'stage', name: 'Stage', type: 'status' },
  { id: 'title', name: 'Title', type: 'text' },
]

describe('setProperty', () => {
  it('merges one value into props, preserving _schema and sibling values', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: pageRow({ props: { [SCHEMA_KEY]: SCHEMA, stage: 'todo' } }),
        error: null,
      }),
    })
    const sb = makeSupabase(chain)

    await setProperty(sb as never, 'page-1', 'stage', 'done')

    const updated = chain.update.mock.calls[0][0]
    expect(updated.props[SCHEMA_KEY]).toEqual(SCHEMA)
    expect(updated.props.stage).toBe('done')
    expect(typeof updated.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'page-1')
  })

  it('is a no-op on a missing page (never writes)', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)

    await setProperty(sb as never, 'missing', 'stage', 'done')

    expect(chain.update).not.toHaveBeenCalled()
  })
})

describe('defineSchema', () => {
  it('writes _schema while preserving existing row values (never clobbers them)', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({
        data: pageRow({ props: { title: 'keep me' } }),
        error: null,
      }),
    })
    const sb = makeSupabase(chain)

    await defineSchema(sb as never, 'page-1', SCHEMA)

    const updated = chain.update.mock.calls[0][0]
    expect(updated.props[SCHEMA_KEY]).toEqual(SCHEMA)
    expect(updated.props.title).toBe('keep me')
  })
})

// ── matchPages ───────────────────────────────────────────────────────────────

describe('matchPages', () => {
  it('calls the match_pages RPC and maps rows to MatchedPage', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'd1',
          parent_id: 'n1',
          type: 'page',
          title: 'Oak table',
          blocks: sampleBlocks,
          status: null,
          similarity: 0.73,
        },
      ],
      error: null,
    })
    const sb = { rpc }
    const vec = [0.1, 0.2, 0.3]

    const out = await matchPages(sb as never, 'user-1', vec, 3)

    expect(rpc).toHaveBeenCalledWith('match_pages', {
      query_embedding: vec,
      match_user_id: 'user-1',
      match_count: 3,
    })
    expect(out).toEqual([
      {
        id: 'd1',
        parentId: 'n1',
        type: 'page',
        title: 'Oak table',
        blocks: sampleBlocks,
        status: null,
        props: {},
        order: 0,
        similarity: 0.73,
      },
    ])
  })

  it('returns [] when the RPC yields no rows', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }
    expect(await matchPages(sb as never, 'user-1', [0.1])).toEqual([])
  })

  it('throws when the RPC errors', async () => {
    const sb = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'rpc boom' } }) }
    await expect(matchPages(sb as never, 'user-1', [0.1])).rejects.toThrow(/rpc boom/)
  })
})
