/**
 * Unit tests for cross-space retrieval (Track D2).
 *
 * matchPages's RPC call shape and mapping, plus the retrieval orchestration
 * (retrievePages) and pure formatting (formatRetrievedPages). embedText and the
 * RPC are mocked; the real pgvector ranking is verified live via a scratchpad
 * smoke script.
 */

import type { Block } from '@/lib/documents/types'
import type { MatchedPage } from '@/lib/pages/client'

// Mock the OpenAI wrapper so retrievePages can run without network I/O.
jest.mock('@/lib/embeddings/openai', () => ({ embedText: jest.fn() }))
// Mock the RPC wrapper so retrievePages's orchestration is isolated.
jest.mock('@/lib/pages/client', () => ({ matchPages: jest.fn() }))

import { matchPages } from '@/lib/pages/client'
import { embedText } from '@/lib/embeddings/openai'
import { retrievePages, formatRetrievedPages } from '@/lib/embeddings/retrieve'

const mockEmbedText = embedText as jest.MockedFunction<typeof embedText>
const mockMatch = matchPages as jest.MockedFunction<typeof matchPages>

const blocks: Block[] = [{ id: 'b1', type: 'text', content: 'Oil finish on oak' }]

function page(overrides: Partial<MatchedPage> = {}): MatchedPage {
  return {
    id: 'd1',
    parentId: null,
    type: 'page',
    title: 'Woodworking',
    blocks,
    status: null,
    order: 0,
    similarity: 0.5,
    ...overrides,
  }
}

// ── formatRetrievedPages (pure) ──────────────────────────────────────────────

describe('formatRetrievedPages', () => {
  it('renders a header and each page with flattened body', () => {
    const out = formatRetrievedPages([page(), page({ id: 'd2', title: 'Health', blocks: [] })])
    expect(out).toContain('[Retrieved from workspace]')
    expect(out).toContain('"Woodworking": Oil finish on oak')
    expect(out).toContain('"Health"') // no body → title only
  })

  it('reports when nothing matched', () => {
    expect(formatRetrievedPages([])).toMatch(/No matching pages/i)
  })

  it('falls back to Untitled for a blank title', () => {
    expect(formatRetrievedPages([page({ title: '', blocks: [] })])).toContain('"Untitled"')
  })
})

// ── retrievePages (orchestration) ────────────────────────────────────────────

describe('retrievePages', () => {
  beforeEach(() => {
    mockEmbedText.mockReset()
    mockMatch.mockReset()
  })

  it('embeds the query and returns matches', async () => {
    const vec = Array(1536).fill(0.02)
    mockEmbedText.mockResolvedValue(vec)
    mockMatch.mockResolvedValue([page()])

    const out = await retrievePages({} as never, 'user-1', 'oak table finish', {
      matchCount: 3,
    })

    expect(mockEmbedText).toHaveBeenCalledWith('oak table finish')
    expect(mockMatch).toHaveBeenCalledWith(expect.anything(), 'user-1', vec, 3)
    expect(out).toHaveLength(1)
  })

  it('returns [] for an empty query without hitting the RPC', async () => {
    mockEmbedText.mockResolvedValue(null)

    const out = await retrievePages({} as never, 'user-1', '   ')

    expect(out).toEqual([])
    expect(mockMatch).not.toHaveBeenCalled()
  })

  it('drops matches below minSimilarity when set', async () => {
    mockEmbedText.mockResolvedValue(Array(1536).fill(0.02))
    mockMatch.mockResolvedValue([
      page({ id: 'hi', similarity: 0.8 }),
      page({ id: 'lo', similarity: 0.1 }),
    ])

    const out = await retrievePages({} as never, 'user-1', 'q', { minSimilarity: 0.5 })

    expect(out.map((p) => p.id)).toEqual(['hi'])
  })
})
