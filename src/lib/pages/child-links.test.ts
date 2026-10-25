import {
  appendChildLink,
  appendChildLinkToParent,
  removeLinksTo,
  restoreLinks,
  findPagesLinkingTo,
  unlinkTrashedSubtree,
  relinkRestoredSubtree,
  trashPageUnlinked,
  restorePageRelinked,
  withDerivedChildLinks,
  type RemovedLink,
} from './child-links'
import type { Block } from '@/lib/modules/content'
import type { PondPage } from './client'
import type { PageRow } from './tree'

const link = (id: string, pageId: string): Block => ({ id, type: 'page-link', pageId })
const text = (id: string): Block => ({ id, type: 'text', content: id })
const row = (id: string, parentId: string | null, order: number, title = id): PageRow => ({
  id,
  parent_id: parentId,
  type: 'page',
  title,
  order,
  updated_at: '2026-01-01T00:00:00.000Z',
})

const mockGetPage = jest.fn()
jest.mock('./client', () => ({
  ...jest.requireActual('./client'),
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

const mockTrashPage = jest.fn()
const mockRestorePage = jest.fn()
jest.mock('@/lib/change-log/trash', () => ({
  trashPage: (...args: unknown[]) => mockTrashPage(...args),
  restorePage: (...args: unknown[]) => mockRestorePage(...args),
}))

const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
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

describe('withDerivedChildLinks', () => {
  it('returns blocks unchanged when unmigrated with no rows', () => {
    const blocks: Block[] = [text('b1')]
    const next = withDerivedChildLinks(blocks, [], 'parent-1', {})
    expect(next).toBe(blocks)
  })

  it('returns blocks unchanged when unmigrated but every child already has a link', () => {
    const rows = [row('child-1', 'parent-1', 0), row('child-2', 'parent-1', 1)]
    const blocks: Block[] = [text('b1'), link('b2', 'child-1'), link('b3', 'child-2')]
    const next = withDerivedChildLinks(blocks, rows, 'parent-1', {})
    expect(next).toBe(blocks)
  })

  it('appends a link for each child missing one, in rail order, with stable ids across calls', () => {
    const rows = [
      row('child-2', 'parent-1', 1),
      row('child-1', 'parent-1', 0),
      row('child-3', 'parent-1', 2),
    ]
    const blocks: Block[] = [text('b1'), link('b2', 'child-2')]

    const first = withDerivedChildLinks(blocks, rows, 'parent-1', {})
    expect(first).not.toBe(blocks)
    expect(first.slice(2)).toEqual([
      { id: expect.any(String), type: 'page-link', pageId: 'child-1' },
      { id: expect.any(String), type: 'page-link', pageId: 'child-3' },
    ])

    const second = withDerivedChildLinks(blocks, rows, 'parent-1', {})
    expect(second.map((b) => b.id)).toEqual(first.map((b) => b.id))
  })

  it('is a no-op once migrated, regardless of rows', () => {
    const rows = [row('child-1', 'parent-1', 0)]
    const blocks: Block[] = [text('b1')]
    const next = withDerivedChildLinks(blocks, rows, 'parent-1', { childLinksMigrated: true })
    expect(next).toBe(blocks)
  })

  it('scopes parentId === null to the home row via withoutDatabasesRoot, matching childLinkTargets', () => {
    const rows = [
      row('db-root', null, 0, 'databases'),
      row('db-child', 'db-root', 0),
      row('top-1', null, 1),
    ]
    const blocks: Block[] = []
    const next = withDerivedChildLinks(blocks, rows, null, {})
    expect(next.map((b) => (b.type === 'page-link' ? b.pageId : null))).toEqual(['top-1'])
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

describe('restoreLinks', () => {
  it('reinserts at the exact original index when the neighbours are untouched', () => {
    const removedLink = link('b2', 'child-1')
    const blocks = [text('b1'), text('b3')]
    const next = restoreLinks(blocks, [
      { parentId: 'parent-1', block: removedLink, index: 1, beforeId: 'b1' },
    ])
    expect(next).toEqual([blocks[0], removedLink, blocks[1]])
  })

  it('reinserts after the same beforeId, now at a shifted index, when a block was inserted ahead of it since removal', () => {
    const removedLink = link('b2', 'child-1')
    const blocks = [text('b0'), text('b1'), text('b3')]
    const next = restoreLinks(blocks, [
      { parentId: 'parent-1', block: removedLink, index: 1, beforeId: 'b1' },
    ])
    expect(next).toEqual([blocks[0], blocks[1], removedLink, blocks[2]])
  })

  it('falls back to the clamped saved index when the beforeId block was deleted since', () => {
    const removedLink = link('b2', 'child-1')
    const blocks = [text('b3')]
    const next = restoreLinks(blocks, [
      { parentId: 'parent-1', block: removedLink, index: 1, beforeId: 'b1' },
    ])
    expect(next).toEqual([blocks[0], removedLink])
  })

  it('clamps the saved index to the current length when it now overshoots', () => {
    const removedLink = link('b2', 'child-1')
    const blocks: Block[] = []
    const next = restoreLinks(blocks, [
      { parentId: 'parent-1', block: removedLink, index: 5, beforeId: 'gone' },
    ])
    expect(next).toEqual([removedLink])
  })

  it('does not duplicate a link that was independently re-added since', () => {
    const readded = link('b-new', 'child-1')
    const removedLink = link('b2', 'child-1')
    const blocks = [text('b1'), readded]
    const next = restoreLinks(blocks, [
      { parentId: 'parent-1', block: removedLink, index: 0, beforeId: null },
    ])
    expect(next).toBe(blocks)
    expect(next).toEqual([blocks[0], readded])
  })

  it('restores two entries for one page in their original relative order', () => {
    const linkA = link('a', 'child-1')
    const linkB = link('b', 'child-2')
    const blocks = [text('mid')]
    const next = restoreLinks(blocks, [
      { parentId: 'parent-1', block: linkA, index: 0, beforeId: null },
      { parentId: 'parent-1', block: linkB, index: 2, beforeId: null },
    ])
    expect(next).toEqual([linkA, blocks[0], linkB])
  })
})

describe('findPagesLinkingTo', () => {
  function makeChain(overrides: Record<string, unknown> = {}) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      contains: jest.fn().mockResolvedValue({ data: [], error: null }),
      ...overrides,
    }
  }

  const pageRow = (id: string, blocks: Block[]) => ({
    id,
    parent_id: null,
    type: 'page',
    title: id,
    blocks,
    props: {},
    order: 0,
  })

  it('returns [] without querying when pageIds is empty', async () => {
    const chain = makeChain()
    const supabase = { from: jest.fn().mockReturnValue(chain) }

    const out = await findPagesLinkingTo(supabase as never, 'pond-1', new Set())

    expect(out).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('queries once per id, pond-scoped, and dedupes a page matched by more than one id', async () => {
    const pageA = pageRow('parent-a', [link('b1', 'child-1')])
    const pageB = pageRow('parent-b', [link('b2', 'child-2')])
    const contains = jest.fn((_col: string, value: string) => {
      const pageId = (JSON.parse(value) as Array<{ pageId: string }>)[0].pageId
      if (pageId === 'child-1') return Promise.resolve({ data: [pageA], error: null })
      if (pageId === 'child-2') return Promise.resolve({ data: [pageA, pageB], error: null })
      return Promise.resolve({ data: [], error: null })
    })
    const chain = makeChain({ contains })
    const supabase = { from: jest.fn().mockReturnValue(chain) }

    const out = await findPagesLinkingTo(
      supabase as never,
      'pond-1',
      new Set(['child-1', 'child-2'])
    )

    expect(supabase.from).toHaveBeenCalledWith('pages')
    expect(chain.eq).toHaveBeenCalledWith('pond_id', 'pond-1')
    expect(contains).toHaveBeenCalledWith(
      'blocks',
      JSON.stringify([{ type: 'page-link', pageId: 'child-1' }])
    )
    expect(contains).toHaveBeenCalledWith(
      'blocks',
      JSON.stringify([{ type: 'page-link', pageId: 'child-2' }])
    )
    expect(contains).toHaveBeenCalledTimes(2)
    expect(out.map((p) => p.id).sort()).toEqual(['parent-a', 'parent-b'])
  })

  it('passes the containment value as a JSON string, not a JS array', async () => {
    const contains = jest.fn().mockResolvedValue({ data: [], error: null })
    const chain = makeChain({ contains })
    const supabase = { from: jest.fn().mockReturnValue(chain) }

    await findPagesLinkingTo(supabase as never, 'pond-1', new Set(['child-1']))

    const [, value] = contains.mock.calls[0]
    expect(typeof value).toBe('string')
    expect(value).toEqual(JSON.stringify([{ type: 'page-link', pageId: 'child-1' }]))
  })

  it('scopes to a null pond with .is rather than .eq', async () => {
    const chain = makeChain()
    const supabase = { from: jest.fn().mockReturnValue(chain) }

    await findPagesLinkingTo(supabase as never, null, new Set(['child-1']))

    expect(chain.is).toHaveBeenCalledWith('pond_id', null)
    expect(chain.eq).not.toHaveBeenCalled()
  })

  it('throws when a read errors', async () => {
    const chain = makeChain({
      contains: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    })
    const supabase = { from: jest.fn().mockReturnValue(chain) }

    await expect(
      findPagesLinkingTo(supabase as never, 'pond-1', new Set(['child-1']))
    ).rejects.toThrow(/boom/)
  })
})

describe('unlinkTrashedSubtree', () => {
  const parentPage = (id: string, blocks: Block[]) => ({
    id,
    parent_id: null,
    type: 'page',
    title: id,
    blocks,
    props: {},
    order: 0,
  })

  /** One shared `.from('pages')` chain backing both `findPagesLinkingTo`'s
   *  `.contains` read and this function's own `props` read/update. */
  function makeSupabase({
    containsResults = {},
    propsRow = { props: {} },
    updateError = null as { message: string } | null,
  }: {
    containsResults?: Record<string, unknown[]>
    propsRow?: { props: unknown } | null
    updateError?: { message: string } | null
  } = {}) {
    const update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: updateError }),
    })
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      contains: jest.fn((_col: string, value: string) => {
        const pageId = (JSON.parse(value) as Array<{ pageId: string }>)[0].pageId
        return Promise.resolve({ data: containsResults[pageId] ?? [], error: null })
      }),
      maybeSingle: jest.fn().mockResolvedValue({ data: propsRow }),
      update,
    }
    return { from: jest.fn().mockReturnValue(chain), _chain: chain, update }
  }

  let invalidateQueries: jest.Mock
  let queryClient: never

  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
    mockFlushPendingPageSave.mockResolvedValue(undefined)
    invalidateQueries = jest.fn().mockResolvedValue(undefined)
    queryClient = { invalidateQueries } as never
  })

  it('unlinks a parent found outside the subtree, committing and invalidating it', async () => {
    const link1 = link('b1', 'child-1')
    const text1 = text('b2')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1, text1])] },
    })
    mockGetPage.mockResolvedValue({
      id: 'parent-a',
      parentId: null,
      type: 'page',
      title: 'Parent A',
      blocks: [link1, text1],
      order: 0,
      props: {},
    })

    await unlinkTrashedSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['child-1']),
    })

    expect(mockFlushPendingPageSave).toHaveBeenCalledWith('parent-a')
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const [, , pageId, blocks, opts] = mockCommitBlocks.mock.calls[0]
    expect(pageId).toBe('parent-a')
    expect(blocks).toEqual([text1])
    expect(opts).toMatchObject({ ownEdit: true, before: [link1, text1], pondId: 'pond-1' })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'parent-a'] })

    expect(supabase._chain.update).toHaveBeenCalledTimes(1)
    const [payload] = supabase.update.mock.calls[0]
    expect(payload.props.unlinkedLinks).toEqual([
      { parentId: 'parent-a', block: link1, index: 0, beforeId: null },
    ])
  })

  it('writes nothing to the root page when no live parent links into the subtree', async () => {
    const supabase = makeSupabase({ containsResults: {} })

    await unlinkTrashedSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['child-1']),
    })

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(supabase._chain.update).not.toHaveBeenCalled()
  })

  it('flushes a changed parent\'s pending save and re-reads it before writing', async () => {
    const order: string[] = []
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    mockFlushPendingPageSave.mockImplementation(async (id: string) => {
      order.push(`flush:${id}`)
    })
    mockGetPage.mockImplementation(async () => {
      order.push('getPage')
      return {
        id: 'parent-a',
        parentId: null,
        type: 'page',
        title: 'Parent A',
        blocks: [link1],
        order: 0,
        props: {},
      }
    })

    await unlinkTrashedSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['child-1']),
    })

    expect(order).toEqual(['flush:parent-a', 'getPage'])
  })

  it('skips a parent whose fresh read no longer has the link', async () => {
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    mockGetPage.mockResolvedValue({
      id: 'parent-a',
      parentId: null,
      type: 'page',
      title: 'Parent A',
      blocks: [text('b2')],
      order: 0,
      props: {},
    })

    await unlinkTrashedSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['child-1']),
    })

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(supabase._chain.update).not.toHaveBeenCalled()
  })

  it('never reads or commits a parent that is itself inside the trashed subtree', async () => {
    const linkToC = link('b1', 'child-1')
    const linkToP = link('b2', 'parent-p')
    const supabase = makeSupabase({
      containsResults: {
        'child-1': [parentPage('parent-p', [linkToC])],
        'parent-p': [parentPage('outside-q', [linkToP])],
      },
    })
    mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => {
      if (id === 'outside-q') {
        return {
          id: 'outside-q',
          parentId: null,
          type: 'page',
          title: 'Outside Q',
          blocks: [linkToP],
          order: 0,
          props: {},
        }
      }
      throw new Error(`unexpected getPage(${id})`)
    })

    await unlinkTrashedSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['parent-p', 'child-1']),
    })

    expect(mockGetPage).toHaveBeenCalledTimes(1)
    expect(mockGetPage).toHaveBeenCalledWith(supabase, 'outside-q')
    expect(mockFlushPendingPageSave).toHaveBeenCalledTimes(1)
    expect(mockFlushPendingPageSave).toHaveBeenCalledWith('outside-q')
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const [, , pageId] = mockCommitBlocks.mock.calls[0]
    expect(pageId).toBe('outside-q')
  })

  it('never throws — logs and returns when the commit fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    mockGetPage.mockResolvedValue({
      id: 'parent-a',
      parentId: null,
      type: 'page',
      title: 'Parent A',
      blocks: [link1],
      order: 0,
      props: {},
    })
    mockCommitBlocks.mockRejectedValue(new Error('boom'))

    await expect(
      unlinkTrashedSubtree(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
        subtreeIds: new Set(['child-1']),
      })
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it("records a parent's removed links on the root before committing it, so an earlier parent's removal is not lost when a later parent's commit fails", async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const linkA = link('bA', 'child-1')
    const linkB = link('bB', 'child-1')
    const supabase = makeSupabase({
      containsResults: {
        'child-1': [parentPage('parent-a', [linkA]), parentPage('parent-b', [linkB])],
      },
    })
    mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => ({
      id,
      parentId: null,
      type: 'page',
      title: id,
      blocks: id === 'parent-a' ? [linkA] : [linkB],
      order: 0,
      props: {},
    }))
    mockCommitBlocks.mockImplementation((_s: unknown, _q: unknown, pageId: string) =>
      pageId === 'parent-b' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
    )

    await expect(
      unlinkTrashedSubtree(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
        subtreeIds: new Set(['child-1']),
      })
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalled()
    expect(supabase.update).toHaveBeenCalled()
    const [firstPayload] = supabase.update.mock.calls[0]
    expect(firstPayload.props.unlinkedLinks).toEqual([
      { parentId: 'parent-a', block: linkA, index: 0, beforeId: null },
    ])
    consoleError.mockRestore()
  })

  it('unlinks the same child from two different parents, committing each and recording both entries on the root', async () => {
    const linkA = link('bA', 'child-1')
    const linkB = link('bB', 'child-1')
    let rootProps: Record<string, unknown> = {}
    const update = jest.fn((payload: { props: Record<string, unknown> }) => {
      rootProps = payload.props
      return { eq: jest.fn().mockResolvedValue({ error: null }) }
    })
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      contains: jest.fn((_col: string, value: string) => {
        const pageId = (JSON.parse(value) as Array<{ pageId: string }>)[0].pageId
        return Promise.resolve({
          data:
            pageId === 'child-1'
              ? [parentPage('parent-a', [linkA]), parentPage('parent-b', [linkB])]
              : [],
          error: null,
        })
      }),
      maybeSingle: jest.fn(() => Promise.resolve({ data: { props: rootProps }, error: null })),
      update,
    }
    const supabase = { from: jest.fn().mockReturnValue(chain) }
    mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => ({
      id,
      parentId: null,
      type: 'page',
      title: id,
      blocks: id === 'parent-a' ? [linkA] : [linkB],
      order: 0,
      props: {},
    }))

    await unlinkTrashedSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['child-1']),
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(rootProps.unlinkedLinks).toEqual([
      { parentId: 'parent-a', block: linkA, index: 0, beforeId: null },
      { parentId: 'parent-b', block: linkB, index: 0, beforeId: null },
    ])
  })

  it('writes nothing — and never commits — when the root-props read errors, rather than wiping existing props', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockGetPage.mockResolvedValue({
      id: 'parent-a',
      parentId: null,
      type: 'page',
      title: 'Parent A',
      blocks: [link1],
      order: 0,
      props: {},
    })

    await expect(
      unlinkTrashedSubtree(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
        subtreeIds: new Set(['child-1']),
      })
    ).resolves.toBeUndefined()

    expect(supabase._chain.update).not.toHaveBeenCalled()
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('writes nothing — and never commits a parent — when the root-props read returns no row and no error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockGetPage.mockResolvedValue({
      id: 'parent-a',
      parentId: null,
      type: 'page',
      title: 'Parent A',
      blocks: [link1],
      order: 0,
      props: {},
    })

    await expect(
      unlinkTrashedSubtree(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
        subtreeIds: new Set(['child-1']),
      })
    ).resolves.toBeUndefined()

    expect(supabase._chain.update).not.toHaveBeenCalled()
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('relinkRestoredSubtree', () => {
  const pageWith = (id: string, blocks: Block[]) => ({
    id,
    parentId: null,
    type: 'page',
    title: id,
    blocks,
    order: 0,
    props: {},
  })

  function makeSupabase({
    rootProps = { props: {} } as { props: unknown } | null,
    updateError = null as { message: string } | null,
  } = {}) {
    const update = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: updateError }),
    })
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: rootProps }),
      update,
    }
    return { from: jest.fn().mockReturnValue(chain), _chain: chain, update }
  }

  let invalidateQueries: jest.Mock
  let queryClient: never

  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
    mockFlushPendingPageSave.mockResolvedValue(undefined)
    invalidateQueries = jest.fn().mockResolvedValue(undefined)
    queryClient = { invalidateQueries } as never
  })

  it('is a no-op when props.unlinkedLinks is absent', async () => {
    const supabase = makeSupabase({ rootProps: { props: {} } })

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockGetPage).not.toHaveBeenCalled()
    expect(supabase._chain.update).not.toHaveBeenCalled()
  })

  it('is a no-op when props.unlinkedLinks is an empty array', async () => {
    const supabase = makeSupabase({ rootProps: { props: { unlinkedLinks: [] } } })

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockGetPage).not.toHaveBeenCalled()
    expect(supabase._chain.update).not.toHaveBeenCalled()
  })

  it('restores a link to its parent, commits, invalidates, and clears the field', async () => {
    const link1 = link('b1', 'child-1')
    const text1 = text('b2')
    const entry: RemovedLink = { parentId: 'parent-a', block: link1, index: 0, beforeId: null }
    const supabase = makeSupabase({
      rootProps: { props: { unlinkedLinks: [entry], other: 'kept' } },
    })
    mockGetPage.mockResolvedValue(pageWith('parent-a', [text1]))

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockFlushPendingPageSave).toHaveBeenCalledWith('parent-a')
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const [, , pageId, blocks, opts] = mockCommitBlocks.mock.calls[0]
    expect(pageId).toBe('parent-a')
    expect(blocks).toEqual([link1, text1])
    expect(opts).toMatchObject({ ownEdit: true, before: [text1], pondId: 'pond-1' })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'parent-a'] })

    expect(supabase._chain.update).toHaveBeenCalledTimes(1)
    const [payload] = supabase.update.mock.calls[0]
    expect(payload.props).toEqual({ other: 'kept' })
  })

  it('skips an entry whose parent no longer exists but still clears the field', async () => {
    const link1 = link('b1', 'child-1')
    const entry: RemovedLink = { parentId: 'gone', block: link1, index: 0, beforeId: null }
    const supabase = makeSupabase({ rootProps: { props: { unlinkedLinks: [entry] } } })
    mockGetPage.mockResolvedValue(null)

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(supabase._chain.update).toHaveBeenCalledTimes(1)
    const [payload] = supabase.update.mock.calls[0]
    expect(payload.props.unlinkedLinks).toBeUndefined()
  })

  it('groups two entries for the same parent into a single commit, in order', async () => {
    const link1 = link('b1', 'child-1')
    const link2 = link('b2', 'child-2')
    const entries: RemovedLink[] = [
      { parentId: 'parent-a', block: link1, index: 0, beforeId: null },
      { parentId: 'parent-a', block: link2, index: 1, beforeId: 'b1' },
    ]
    const supabase = makeSupabase({ rootProps: { props: { unlinkedLinks: entries } } })
    mockGetPage.mockResolvedValue(pageWith('parent-a', []))

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockGetPage).toHaveBeenCalledTimes(1)
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const [, , , blocks] = mockCommitBlocks.mock.calls[0]
    expect(blocks).toEqual([link1, link2])
  })

  it('never throws — logs and returns when a commit fails, leaving the field unwritten', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const link1 = link('b1', 'child-1')
    const entry: RemovedLink = { parentId: 'parent-a', block: link1, index: 0, beforeId: null }
    const supabase = makeSupabase({ rootProps: { props: { unlinkedLinks: [entry] } } })
    mockGetPage.mockResolvedValue(pageWith('parent-a', []))
    mockCommitBlocks.mockRejectedValue(new Error('boom'))

    await expect(
      relinkRestoredSubtree(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
      })
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalled()
    expect(supabase._chain.update).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('does nothing — never reads a parent or writes — when the root-props read errors, rather than wiping existing props', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase()
    supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(
      relinkRestoredSubtree(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
      })
    ).resolves.toBeUndefined()

    expect(mockGetPage).not.toHaveBeenCalled()
    expect(supabase._chain.update).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('restores entries for two different parents, each committed separately at its saved position', async () => {
    const linkA = link('bA', 'child-1')
    const linkB = link('bB', 'child-2')
    const anchor = text('anchor')
    const other1 = text('other1')
    const other2 = text('other2')
    const entries: RemovedLink[] = [
      { parentId: 'parent-a', block: linkA, index: 0, beforeId: null },
      { parentId: 'parent-b', block: linkB, index: 0, beforeId: 'anchor' },
    ]
    const supabase = makeSupabase({ rootProps: { props: { unlinkedLinks: entries } } })
    mockGetPage.mockImplementation(async (_supabase: unknown, id: string) =>
      id === 'parent-a'
        ? pageWith('parent-a', [other1])
        : pageWith('parent-b', [other1, anchor, other2])
    )

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockCommitBlocks).toHaveBeenCalledTimes(2)
    const callForParent = (id: string) => mockCommitBlocks.mock.calls.find((call) => call[2] === id)
    expect(callForParent('parent-a')?.[3]).toEqual([linkA, other1])
    expect(callForParent('parent-b')?.[3]).toEqual([other1, anchor, linkB, other2])
  })

  it('drops a malformed unlinkedLinks entry at the read boundary instead of throwing', async () => {
    const link1 = link('b1', 'child-1')
    const validEntry: RemovedLink = { parentId: 'parent-a', block: link1, index: 0, beforeId: null }
    const malformed = { parentId: 'parent-b' }
    const supabase = makeSupabase({
      rootProps: { props: { unlinkedLinks: [malformed, validEntry] } },
    })
    mockGetPage.mockResolvedValue(pageWith('parent-a', []))

    await relinkRestoredSubtree(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
    })

    expect(mockGetPage).toHaveBeenCalledTimes(1)
    expect(mockGetPage).toHaveBeenCalledWith(supabase, 'parent-a')
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
  })
})

describe('trashPageUnlinked', () => {
  const parentPage = (id: string, blocks: Block[]) => ({
    id,
    parent_id: null,
    type: 'page',
    title: id,
    blocks,
    props: {},
    order: 0,
  })

  /** One shared `.from('pages')` chain backing `findPagesLinkingTo`'s
   *  `.contains` read and the root's own `props` read/write — `update`
   *  mutates the props a later `maybeSingle` read sees, so a test can assert
   *  the unlink's write is what the relink-on-throw path reads back. */
  function makeSupabase({
    containsResults = {} as Record<string, unknown[]>,
    initialProps = {} as Record<string, unknown>,
  } = {}) {
    let props = { ...initialProps }
    const maybeSingle = jest.fn(() => Promise.resolve({ data: { props }, error: null }))
    const update = jest.fn((payload: { props: Record<string, unknown> }) => {
      props = payload.props
      return { eq: jest.fn().mockResolvedValue({ error: null }) }
    })
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      contains: jest.fn((_col: string, value: string) => {
        const pageId = (JSON.parse(value) as Array<{ pageId: string }>)[0].pageId
        return Promise.resolve({ data: containsResults[pageId] ?? [], error: null })
      }),
      maybeSingle,
      update,
    }
    return { from: jest.fn().mockReturnValue(chain), _chain: chain, update }
  }

  let invalidateQueries: jest.Mock
  let queryClient: never

  beforeEach(() => {
    jest.clearAllMocks()
    mockCommitBlocks.mockResolvedValue(undefined)
    mockFlushPendingPageSave.mockResolvedValue(undefined)
    invalidateQueries = jest.fn().mockResolvedValue(undefined)
    queryClient = { invalidateQueries } as never
  })

  it('unlinks then trashes, and never relinks, when trashPage succeeds', async () => {
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    mockGetPage.mockResolvedValue({
      id: 'parent-a',
      parentId: null,
      type: 'page',
      title: 'Parent A',
      blocks: [link1],
      order: 0,
      props: {},
    })
    mockTrashPage.mockResolvedValue(undefined)

    await trashPageUnlinked(supabase as never, queryClient, {
      pondId: 'pond-1',
      rootPageId: 'root-1',
      subtreeIds: new Set(['child-1']),
    })

    expect(mockTrashPage).toHaveBeenCalledWith(supabase, 'root-1')
    expect(mockCommitBlocks).toHaveBeenCalledTimes(1)
    const [, , , unlinkedBlocks] = mockCommitBlocks.mock.calls[0]
    expect(unlinkedBlocks).toEqual([])
    expect(supabase._chain.update).toHaveBeenCalledTimes(1)
  })

  it('relinks every unlinked parent and rethrows when trashPage itself throws', async () => {
    const link1 = link('b1', 'child-1')
    const supabase = makeSupabase({
      containsResults: { 'child-1': [parentPage('parent-a', [link1])] },
    })
    // Phase 1 (unlink, inside `unlinkTrashedSubtree`): the parent still has
    // the link. Phase 2 (relink, inside `relinkRestoredSubtree`, run only
    // because `trashPage` below throws): the parent no longer has it — the
    // unlink's own commit (mocked, so it doesn't really mutate anything) is
    // what a real DB would have landed by then.
    mockGetPage
      .mockResolvedValueOnce({
        id: 'parent-a',
        parentId: null,
        type: 'page',
        title: 'Parent A',
        blocks: [link1],
        order: 0,
        props: {},
      })
      .mockResolvedValueOnce({
        id: 'parent-a',
        parentId: null,
        type: 'page',
        title: 'Parent A',
        blocks: [],
        order: 0,
        props: {},
      })
    mockTrashPage.mockRejectedValue(new Error('network'))

    await expect(
      trashPageUnlinked(supabase as never, queryClient, {
        pondId: 'pond-1',
        rootPageId: 'root-1',
        subtreeIds: new Set(['child-1']),
      })
    ).rejects.toThrow('network')

    expect(mockCommitBlocks).toHaveBeenCalledTimes(2)
    const [, , unlinkPageId, unlinkedBlocks] = mockCommitBlocks.mock.calls[0]
    expect(unlinkPageId).toBe('parent-a')
    expect(unlinkedBlocks).toEqual([])
    const [, , relinkPageId, relinkedBlocks] = mockCommitBlocks.mock.calls[1]
    expect(relinkPageId).toBe('parent-a')
    expect(relinkedBlocks).toEqual([link1])

    // The root's props carried `unlinkedLinks` long enough for the relink to
    // read it, then the relink cleared it — never left dangling for a
    // caller that doesn't know to look.
    expect(supabase._chain.update).toHaveBeenCalledTimes(2)
    const [relinkPayload] = supabase.update.mock.calls[1]
    expect(relinkPayload.props.unlinkedLinks).toBeUndefined()
  })
})

describe('restorePageRelinked', () => {
  let invalidateQueries: jest.Mock
  let queryClient: never

  beforeEach(() => {
    jest.clearAllMocks()
    invalidateQueries = jest.fn().mockResolvedValue(undefined)
    queryClient = { invalidateQueries } as never
  })

  it('remembers the restore record with session undo, in the restore\'s own pond', async () => {
    mockRestorePage.mockResolvedValue('restore-record-1')

    await restorePageRelinked({} as never, queryClient, {
      pondId: 'pond-1',
      recordId: 'delete-record-1',
      rootPageId: null,
    })

    expect(mockRestorePage).toHaveBeenCalledWith({}, 'delete-record-1')
    expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['restore-record-1'] })
  })

  it('skips remembering when pondId is null', async () => {
    mockRestorePage.mockResolvedValue('restore-record-1')

    await restorePageRelinked({} as never, queryClient, {
      pondId: null,
      recordId: 'delete-record-1',
      rootPageId: null,
    })

    expect(mockRemember).not.toHaveBeenCalled()
  })
})
