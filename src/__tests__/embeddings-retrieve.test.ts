/**
 * Unit tests for cross-space retrieval (Track D2).
 *
 * matchDocuments's RPC call shape and mapping, plus the retrieval orchestration
 * (retrieveDocuments) and pure formatting (formatRetrievedDocs). embedText and
 * the RPC are mocked; the real pgvector ranking is verified live via a
 * scratchpad smoke script.
 */

import type { Block } from '@/lib/documents/types'
import type { MatchedDocument } from '@/lib/documents/client'

// Mock the OpenAI wrapper so retrieveDocuments can run without network I/O.
jest.mock('@/lib/embeddings/openai', () => ({ embedText: jest.fn() }))
// Mock the RPC wrapper so retrieveDocuments's orchestration is isolated.
jest.mock('@/lib/documents/client', () => ({ matchDocuments: jest.fn() }))

import { matchDocuments } from '@/lib/documents/client'
import { embedText } from '@/lib/embeddings/openai'
import { retrieveDocuments, formatRetrievedDocs } from '@/lib/embeddings/retrieve'

const mockEmbedText = embedText as jest.MockedFunction<typeof embedText>
const mockMatch = matchDocuments as jest.MockedFunction<typeof matchDocuments>

const blocks: Block[] = [{ id: 'b1', type: 'text', content: 'Oil finish on oak' }]

function doc(overrides: Partial<MatchedDocument> = {}): MatchedDocument {
  return {
    id: 'd1',
    nodeId: null,
    nodeType: null,
    title: 'Woodworking',
    blocks,
    similarity: 0.5,
    ...overrides,
  }
}

// ── formatRetrievedDocs (pure) ───────────────────────────────────────────────

describe('formatRetrievedDocs', () => {
  it('renders a header and each doc with flattened body', () => {
    const out = formatRetrievedDocs([doc(), doc({ id: 'd2', title: 'Health', blocks: [] })])
    expect(out).toContain('[Retrieved from workspace]')
    expect(out).toContain('"Woodworking": Oil finish on oak')
    expect(out).toContain('"Health"') // no body → title only
  })

  it('reports when nothing matched', () => {
    expect(formatRetrievedDocs([])).toMatch(/No matching documents/i)
  })

  it('falls back to Untitled for a blank title', () => {
    expect(formatRetrievedDocs([doc({ title: '', blocks: [] })])).toContain('"Untitled"')
  })
})

// ── retrieveDocuments (orchestration) ────────────────────────────────────────

describe('retrieveDocuments', () => {
  beforeEach(() => {
    mockEmbedText.mockReset()
    mockMatch.mockReset()
  })

  it('embeds the query and returns matches', async () => {
    const vec = Array(1536).fill(0.02)
    mockEmbedText.mockResolvedValue(vec)
    mockMatch.mockResolvedValue([doc()])

    const out = await retrieveDocuments({} as never, 'user-1', 'oak table finish', {
      matchCount: 3,
    })

    expect(mockEmbedText).toHaveBeenCalledWith('oak table finish')
    expect(mockMatch).toHaveBeenCalledWith(expect.anything(), 'user-1', vec, 3)
    expect(out).toHaveLength(1)
  })

  it('returns [] for an empty query without hitting the RPC', async () => {
    mockEmbedText.mockResolvedValue(null)

    const out = await retrieveDocuments({} as never, 'user-1', '   ')

    expect(out).toEqual([])
    expect(mockMatch).not.toHaveBeenCalled()
  })

  it('drops matches below minSimilarity when set', async () => {
    mockEmbedText.mockResolvedValue(Array(1536).fill(0.02))
    mockMatch.mockResolvedValue([
      doc({ id: 'hi', similarity: 0.8 }),
      doc({ id: 'lo', similarity: 0.1 }),
    ])

    const out = await retrieveDocuments({} as never, 'user-1', 'q', { minSimilarity: 0.5 })

    expect(out.map((d) => d.id)).toEqual(['hi'])
  })
})
