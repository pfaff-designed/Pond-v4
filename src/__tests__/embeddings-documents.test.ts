/**
 * Unit tests for the document-embedding orchestration (Track D).
 *
 * Pure logic (documentText) and the DB-write shape (updateEmbedding) are unit
 * tested here; the OpenAI wrapper (embedText) is mocked. The real network+DB
 * path is verified live via a scratchpad smoke script.
 */

import type { Block } from '@/lib/documents/types'

// Mock the OpenAI wrapper so embedDocument can be tested without network I/O.
jest.mock('@/lib/embeddings/openai', () => ({
  embedText: jest.fn(),
}))

import { documentText, embedDocument } from '@/lib/embeddings/documents'
import { updateEmbedding } from '@/lib/documents/client'
import { embedText } from '@/lib/embeddings/openai'

const mockEmbedText = embedText as jest.MockedFunction<typeof embedText>

const sampleBlocks: Block[] = [
  { id: 'b1', type: 'text', content: 'Refinishing the oak table' },
  { id: 'b2', type: 'todo', items: [{ id: 'i1', label: 'Sand top', checked: false }] },
]

// ── Chain mock (mirrors documents-client.test.ts) ────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

function makeSupabase(chain = makeChain()) {
  return { from: jest.fn().mockReturnValue(chain), _chain: chain }
}

// ── documentText (pure) ──────────────────────────────────────────────────────

describe('documentText', () => {
  it('joins title and flattened block body', () => {
    const text = documentText('Oak Table', sampleBlocks)
    expect(text).toContain('Oak Table')
    expect(text).toContain('Refinishing the oak table')
    expect(text).toContain('- [ ] Sand top')
    // title comes first
    expect(text.indexOf('Oak Table')).toBeLessThan(text.indexOf('Refinishing'))
  })

  it('omits an empty title', () => {
    const text = documentText('', sampleBlocks)
    expect(text.startsWith('Refinishing')).toBe(true)
  })

  it('omits empty blocks (title only)', () => {
    expect(documentText('Just a Title', [])).toBe('Just a Title')
  })

  it('returns empty string when there is nothing to embed', () => {
    expect(documentText('   ', [])).toBe('')
  })
})

// ── updateEmbedding (DB write shape) ─────────────────────────────────────────

describe('updateEmbedding', () => {
  it('writes the embedding and bumps updated_at for the id', async () => {
    const chain = makeChain()
    const sb = makeSupabase(chain)
    const vec = [0.1, 0.2, 0.3]

    await updateEmbedding(sb as never, 'doc-1', vec)

    expect(sb.from).toHaveBeenCalledWith('documents')
    const updated = chain.update.mock.calls[0][0]
    expect(updated.embedding).toEqual(vec)
    expect(typeof updated.updated_at).toBe('string')
    expect(chain.eq).toHaveBeenCalledWith('id', 'doc-1')
  })

  it('throws when the update errors', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    })
    const sb = makeSupabase(chain)

    await expect(updateEmbedding(sb as never, 'doc-1', [0.1])).rejects.toThrow(/boom/)
  })
})

// ── embedDocument (orchestration) ────────────────────────────────────────────

describe('embedDocument', () => {
  beforeEach(() => mockEmbedText.mockReset())

  it('embeds the document text and persists the vector', async () => {
    const vec = Array(1536).fill(0.01)
    mockEmbedText.mockResolvedValue(vec)
    const chain = makeChain()
    const sb = makeSupabase(chain)

    const wrote = await embedDocument(sb as never, {
      id: 'doc-1',
      title: 'Oak Table',
      blocks: sampleBlocks,
    })

    expect(wrote).toBe(true)
    // embedded text is title + flattened blocks
    const embeddedText = mockEmbedText.mock.calls[0][0]
    expect(embeddedText).toContain('Oak Table')
    expect(embeddedText).toContain('Sand top')
    expect(chain.update.mock.calls[0][0].embedding).toBe(vec)
  })

  it('is a no-op when there is nothing to embed', async () => {
    mockEmbedText.mockResolvedValue(null)
    const chain = makeChain()
    const sb = makeSupabase(chain)

    const wrote = await embedDocument(sb as never, { id: 'doc-1', title: '   ', blocks: [] })

    expect(wrote).toBe(false)
    expect(chain.update).not.toHaveBeenCalled()
  })
})
