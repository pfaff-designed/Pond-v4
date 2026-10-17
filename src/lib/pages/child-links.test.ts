import { appendChildLink, appendChildLinkToParent, removeLinksTo } from './child-links'
import type { Block } from '@/lib/modules/content'
import type { PondPage } from './client'

const mockGetPage = jest.fn()
jest.mock('./client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

const mockCommitBlocks = jest.fn()
jest.mock('./commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

const mockFlushPendingPageSave = jest.fn()
jest.mock('./page-flush', () => ({
  flushPendingPageSave: (...args: unknown[]) => mockFlushPendingPageSave(...args),
}))

describe('appendChildLink', () => {
  it('appends one link to an empty block array', () => {
    const next = appendChildLink([], 'child-1')
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ type: 'page-link', pageId: 'child-1' })
  })

  it('appends the link at the end of existing blocks', () => {
    const existing: Block[] = [{ id: 'b1', type: 'text', content: 'hello' }]
    const next = appendChildLink(existing, 'child-1')
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(existing[0])
    expect(next[1]).toMatchObject({ type: 'page-link', pageId: 'child-1' })
  })

  it('is a no-op when a link to that child already exists anywhere', () => {
    const existing: Block[] = [
      { id: 'b1', type: 'page-link', pageId: 'child-1' },
      { id: 'b2', type: 'text', content: 'hello' },
    ]
    const next = appendChildLink(existing, 'child-1')
    expect(next).toBe(existing)
    expect(next).toHaveLength(2)
  })
})

describe('appendChildLinkToParent', () => {
  const supabase = {} as never
  const pageWith = (blocks: Block[]): PondPage => ({
    id: 'parent-1',
    parentId: null,
    type: 'page',
    title: 'Parent',
    blocks,
    order: 0,
    props: {},
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
    mockFlushPendingPageSave.mockReturnValue(undefined)
  })

  it('awaits the parent\'s pending save before reading it', async () => {
    const parent = pageWith([{ id: 'b1', type: 'text', content: 'hello' }])
    const order: string[] = []
    mockFlushPendingPageSave.mockImplementation(async (pageId: string) => {
      order.push(`flush:${pageId}`)
    })
    mockGetPage.mockImplementation(async () => {
      order.push('getPage')
      return parent
    })
    const invalidateQueries = jest.fn().mockResolvedValue(undefined)
    const queryClient = { invalidateQueries } as never

    await appendChildLinkToParent(supabase, queryClient, 'parent-1', 'child-1', 'pond-1')

    expect(order).toEqual(['flush:parent-1', 'getPage'])
  })

  it('writes once when the parent has no link to the child yet', async () => {
    const parent = pageWith([{ id: 'b1', type: 'text', content: 'hello' }])
    mockGetPage.mockResolvedValue(parent)
    const invalidateQueries = jest.fn().mockResolvedValue(undefined)
    const queryClient = { invalidateQueries } as never

    await appendChildLinkToParent(supabase, queryClient, 'parent-1', 'child-1', 'pond-1')

    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const [, , pageId, blocks, opts] = mockCommitBlocks.mock.calls[0]
    expect(pageId).toBe('parent-1')
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toMatchObject({ type: 'page-link', pageId: 'child-1' })
    expect(opts).toMatchObject({ ownEdit: true, before: parent.blocks, pondId: 'pond-1' })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'parent-1'] })
  })

  it('writes nothing when the parent already links the child', async () => {
    const parent = pageWith([{ id: 'b1', type: 'page-link', pageId: 'child-1' }])
    mockGetPage.mockResolvedValue(parent)
    const invalidateQueries = jest.fn().mockResolvedValue(undefined)
    const queryClient = { invalidateQueries } as never

    await appendChildLinkToParent(supabase, queryClient, 'parent-1', 'child-1', 'pond-1')

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('writes nothing when the parent is missing', async () => {
    mockGetPage.mockResolvedValue(null)
    const invalidateQueries = jest.fn().mockResolvedValue(undefined)
    const queryClient = { invalidateQueries } as never

    await appendChildLinkToParent(supabase, queryClient, 'parent-1', 'child-1', 'pond-1')

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(invalidateQueries).not.toHaveBeenCalled()
  })
})

describe('removeLinksTo', () => {
  const link = (id: string, pageId: string): Block => ({ id, type: 'page-link', pageId })
  const text = (id: string): Block => ({ id, type: 'text', content: id })

  it('removes a link that is the only block', () => {
    const blocks = [link('b1', 'child-1')]
    const { blocks: next, removed } = removeLinksTo(blocks, new Set(['child-1']), 'parent-1')
    expect(next).toEqual([])
    expect(removed).toEqual([
      { parentId: 'parent-1', block: blocks[0], index: 0, beforeId: null },
    ])
  })

  it('removes a link that is first, keeping the rest in order', () => {
    const blocks = [link('b1', 'child-1'), text('b2'), text('b3')]
    const { blocks: next, removed } = removeLinksTo(blocks, new Set(['child-1']), 'parent-1')
    expect(next).toEqual([blocks[1], blocks[2]])
    expect(removed).toEqual([
      { parentId: 'parent-1', block: blocks[0], index: 0, beforeId: null },
    ])
  })

  it('removes a link in the middle', () => {
    const blocks = [text('b1'), link('b2', 'child-1'), text('b3')]
    const { blocks: next, removed } = removeLinksTo(blocks, new Set(['child-1']), 'parent-1')
    expect(next).toEqual([blocks[0], blocks[2]])
    expect(removed).toEqual([
      { parentId: 'parent-1', block: blocks[1], index: 1, beforeId: 'b1' },
    ])
  })

  it('removes a link that is last', () => {
    const blocks = [text('b1'), text('b2'), link('b3', 'child-1')]
    const { blocks: next, removed } = removeLinksTo(blocks, new Set(['child-1']), 'parent-1')
    expect(next).toEqual([blocks[0], blocks[1]])
    expect(removed).toEqual([
      { parentId: 'parent-1', block: blocks[2], index: 2, beforeId: 'b2' },
    ])
  })

  it('removes two links to different trashed ids on one page, each with its own index and beforeId', () => {
    const blocks = [link('b1', 'child-1'), text('b2'), link('b3', 'child-2')]
    const { blocks: next, removed } = removeLinksTo(
      blocks,
      new Set(['child-1', 'child-2']),
      'parent-1'
    )
    expect(next).toEqual([blocks[1]])
    expect(removed).toEqual([
      { parentId: 'parent-1', block: blocks[0], index: 0, beforeId: null },
      { parentId: 'parent-1', block: blocks[2], index: 2, beforeId: 'b2' },
    ])
  })

  it('keeps a link whose pageId is not in the set', () => {
    const blocks = [link('b1', 'child-1'), link('b2', 'other-child')]
    const { blocks: next, removed } = removeLinksTo(blocks, new Set(['child-1']), 'parent-1')
    expect(next).toEqual([blocks[1]])
    expect(removed).toEqual([
      { parentId: 'parent-1', block: blocks[0], index: 0, beforeId: null },
    ])
  })

  it('returns the same blocks reference and an empty removed array when nothing matches', () => {
    const blocks = [text('b1'), link('b2', 'other-child')]
    const { blocks: next, removed } = removeLinksTo(blocks, new Set(['child-1']), 'parent-1')
    expect(next).toBe(blocks)
    expect(removed).toEqual([])
  })
})
