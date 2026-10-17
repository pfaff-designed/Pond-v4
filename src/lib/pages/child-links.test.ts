import { appendChildLink, appendChildLinkToParent } from './child-links'
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
