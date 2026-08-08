/**
 * Unit tests for the documents persistence layer (src/lib/documents/client.ts).
 *
 * Mirrors the mocked-chain approach used in conversation.test.ts — no live
 * Supabase. Verifies the CRUD surface the document editor and semantic search
 * will build on:
 *   - getDocumentsForNode  (1:many — a node may have several documents)
 *   - getDocument          (by id)
 *   - createDocument       (node-attached or free-floating)
 *   - saveBlocks           (entire block array written on save)
 *   - updateTitle          (rename)
 */

import {
  getDocumentsForNode,
  getDocument,
  createDocument,
  saveBlocks,
  updateTitle,
} from '@/lib/documents/client'
import type { Block } from '@/lib/documents/types'

// ── Chain mock helpers (same shape as conversation.test.ts) ────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: { id: 'doc-1' }, error: null }),
    // terminal for list queries — resolves the awaited builder
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

// ── getDocumentsForNode ────────────────────────────────────────────────────

describe('getDocumentsForNode', () => {
  it('returns mapped documents for a node', async () => {
    const rows = [
      {
        id: 'doc-1',
        node_id: 'node-1',
        node_type: 'project',
        title: 'Plan',
        blocks: sampleBlocks,
      },
    ]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getDocumentsForNode(sb as never, 'user-1', 'node-1', 'project')

    expect(sb.from).toHaveBeenCalledWith('documents')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(chain.eq).toHaveBeenCalledWith('node_id', 'node-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('doc-1')
    expect(result[0].nodeId).toBe('node-1')
    expect(result[0].nodeType).toBe('project')
    expect(result[0].blocks).toEqual(sampleBlocks)
  })

  it('returns an empty array when the node has no documents', async () => {
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getDocumentsForNode(sb as never, 'user-1', 'node-x', 'area')
    expect(result).toEqual([])
  })

  it('coerces a null/invalid blocks column to an empty array', async () => {
    const rows = [{ id: 'doc-1', node_id: 'n', node_type: 'area', title: 't', blocks: null }]
    const chain = makeChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getDocumentsForNode(sb as never, 'user-1', 'n', 'area')
    expect(result[0].blocks).toEqual([])
  })
})

// ── getDocument ─────────────────────────────────────────────────────────────

describe('getDocument', () => {
  it('returns a single document by id', async () => {
    const row = {
      id: 'doc-1',
      node_id: null,
      node_type: null,
      title: 'Free',
      blocks: sampleBlocks,
    }
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getDocument(sb as never, 'doc-1')

    expect(chain.eq).toHaveBeenCalledWith('id', 'doc-1')
    expect(result).not.toBeNull()
    expect(result!.nodeId).toBeNull()
    expect(result!.blocks).toEqual(sampleBlocks)
  })

  it('returns null when no document is found', async () => {
    const chain = makeChain({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await getDocument(sb as never, 'missing')
    expect(result).toBeNull()
  })
})

// ── createDocument ──────────────────────────────────────────────────────────

describe('createDocument', () => {
  it('inserts a node-attached document with user_id and node fields', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-new' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createDocument(sb as never, 'user-1', {
      nodeId: 'node-1',
      nodeType: 'project',
      title: 'Roadmap',
      blocks: sampleBlocks,
    })

    expect(sb.from).toHaveBeenCalledWith('documents')
    const inserted = chain.insert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      user_id: 'user-1',
      node_id: 'node-1',
      node_type: 'project',
      title: 'Roadmap',
      blocks: sampleBlocks,
    })
    expect(result.id).toBe('doc-new')
    expect(result.nodeId).toBe('node-1')
    expect(result.blocks).toEqual(sampleBlocks)
  })

  it('creates a free-floating document (null node) with sensible defaults', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'doc-free' }, error: null }),
    })
    const sb = makeSupabase(chain)

    const result = await createDocument(sb as never, 'user-1', {})

    const inserted = chain.insert.mock.calls[0][0]
    expect(inserted.user_id).toBe('user-1')
    expect(inserted.node_id ?? null).toBeNull()
    expect(inserted.node_type ?? null).toBeNull()
    expect(inserted.blocks).toEqual([])
    expect(result.id).toBe('doc-free')
    expect(result.nodeId).toBeNull()
    expect(result.blocks).toEqual([])
  })

  it('throws when the insert fails', async () => {
    const chain = makeChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    })
    const sb = makeSupabase(chain)

    await expect(createDocument(sb as never, 'user-1', {})).rejects.toThrow(/boom/)
  })
})

// ── saveBlocks ──────────────────────────────────────────────────────────────

describe('saveBlocks', () => {
  it('writes the entire block array and bumps updated_at', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)

    await saveBlocks(sb as never, 'doc-1', sampleBlocks)

    expect(sb.from).toHaveBeenCalledWith('documents')
    const updated = chain.update.mock.calls[0][0]
    expect(updated.blocks).toEqual(sampleBlocks)
    expect(typeof updated.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'doc-1')
  })

  it('throws when the update errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
    })
    const sb = makeSupabase(chain)

    await expect(saveBlocks(sb as never, 'doc-1', [])).rejects.toThrow(/nope/)
  })
})

// ── updateTitle ─────────────────────────────────────────────────────────────

describe('updateTitle', () => {
  it('updates the title for a document', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    const sb = makeSupabase(chain)

    await updateTitle(sb as never, 'doc-1', 'Renamed')

    const updated = chain.update.mock.calls[0][0]
    expect(updated.title).toBe('Renamed')
    expect(chain.eq).toHaveBeenCalledWith('id', 'doc-1')
  })
})
