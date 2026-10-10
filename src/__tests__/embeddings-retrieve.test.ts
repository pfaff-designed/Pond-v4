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
    props: {},
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

  it('carries each page id so a retrieved page is a cross-page edit target (ticket-30)', () => {
    // A deep page surfaced by search is often the one the user then edits: the
    // [id] makes it a valid read_page / targetPageId target regardless of depth.
    const out = formatRetrievedPages([page(), page({ id: 'd2', title: 'Health', blocks: [] })])
    expect(out).toContain('[d1] "Woodworking"')
    expect(out).toContain('[d2] "Health"')
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

  /** The pond check: `pages` rows by id, answering with the ids in `pond`. */
  const ponds = (byPond: Record<string, string[]>) => {
    const calls: Array<[string, unknown]> = []
    let pond = ''
    const builder = {
      select: () => builder,
      in: () => builder,
      eq: (col: string, val: string) => {
        calls.push([col, val])
        if (col === 'pond_id') pond = val
        return builder
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: (byPond[pond] ?? []).map((id) => ({ id })), error: null }).then(
          resolve
        ),
    }
    return { sb: { from: () => builder } as never, calls }
  }

  it('embeds the query and returns this pond’s matches, nearest first', async () => {
    const vec = Array(1536).fill(0.02)
    mockEmbedText.mockResolvedValue(vec)
    mockMatch.mockResolvedValue([page({ id: 'p1' })])
    const { sb, calls } = ponds({ 'pond-life': ['p1'] })

    const out = await retrievePages(sb, 'user-1', 'pond-life', 'oak table finish', {
      matchCount: 3,
    })

    expect(mockEmbedText).toHaveBeenCalledWith('oak table finish')
    expect(mockMatch).toHaveBeenCalledWith(expect.anything(), 'user-1', vec, 25)
    expect(calls).toContainEqual(['pond_id', 'pond-life'])
    expect(out.map((p) => p.id)).toEqual(['p1'])
  })

  it('never returns another pond’s page, however close it is', async () => {
    mockEmbedText.mockResolvedValue(Array(1536).fill(0.02))
    mockMatch.mockResolvedValue([
      page({ id: 'theirs', similarity: 0.95 }),
      page({ id: 'ours', similarity: 0.6 }),
    ])
    const { sb } = ponds({ 'pond-life': ['theirs'], 'pond-life-2': ['ours'] })

    const out = await retrievePages(sb, 'user-1', 'pond-life-2', 'q', { matchCount: 1 })

    expect(out.map((p) => p.id)).toEqual(['ours'])
  })

  it('returns [] for an empty query without hitting the RPC', async () => {
    mockEmbedText.mockResolvedValue(null)

    const out = await retrievePages({} as never, 'user-1', 'pond-life', '   ')

    expect(out).toEqual([])
    expect(mockMatch).not.toHaveBeenCalled()
  })

  it('drops matches below minSimilarity when set', async () => {
    mockEmbedText.mockResolvedValue(Array(1536).fill(0.02))
    mockMatch.mockResolvedValue([
      page({ id: 'hi', similarity: 0.8 }),
      page({ id: 'lo', similarity: 0.1 }),
    ])
    const { sb } = ponds({ 'pond-life': ['hi', 'lo'] })

    const out = await retrievePages(sb, 'user-1', 'pond-life', 'q', { minSimilarity: 0.5 })

    expect(out.map((p) => p.id)).toEqual(['hi'])
  })
})
