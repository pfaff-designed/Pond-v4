/**
 * hydratePageLinkBlocks (assemble.ts) — the read-hydration seam that grafts a
 * `page-link` block's linked page's live title on, transiently, before the sync
 * `serialize` runs, mirroring `hydrateViewBlocks` (#41).
 *
 * KAN-122: `pageLinkDescriptor.serialize` renders `title` off the data (falling
 * back to `'Page link'` when absent), so this guards the seam that supplies it —
 * the AI context must read the linked page's CURRENT title, never the raw id.
 */
import { hydratePageLinkBlocks } from '@/lib/context/assemble'
import { pageLinkDescriptor } from '@/lib/modules/page-link/schema'
import type { HydratedPageLinkBlock } from '@/lib/modules/page-link/schema'
import type { Block } from '@/lib/documents/types'

function makePagesSupabase(pagesById: Record<string, { id: string; title: string }>) {
  const from = jest.fn(() => {
    let ids: string[] = []
    const chain: Record<string, jest.Mock> = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      in: jest.fn((_col: string, idList: string[]) => {
        ids = idList
        return Promise.resolve({
          data: ids.map((id) => pagesById[id]).filter(Boolean),
          error: null,
        })
      }),
    }
    return chain
  })
  return { from } as never
}

const linkOf = (blocks: Block[], id: string) =>
  blocks.find((b) => b.id === id) as HydratedPageLinkBlock | undefined

describe('hydratePageLinkBlocks (KAN-122)', () => {
  it("grafts the linked page's current title onto a page-link block", async () => {
    const sb = makePagesSupabase({ 'page-1': { id: 'page-1', title: 'Cabinets' } })
    const blocks: Block[] = [{ id: 'l1', type: 'page-link', pageId: 'page-1' } as Block]
    const out = await hydratePageLinkBlocks(sb, 'u1', blocks)
    expect(linkOf(out, 'l1')?.title).toBe('Cabinets')
  })

  it('fetches every distinct linked page once, even with repeats', async () => {
    const sb = makePagesSupabase({
      'page-1': { id: 'page-1', title: 'Cabinets' },
      'page-2': { id: 'page-2', title: 'Flooring' },
    })
    const blocks: Block[] = [
      { id: 'l1', type: 'page-link', pageId: 'page-1' } as Block,
      { id: 'l2', type: 'page-link', pageId: 'page-2' } as Block,
      { id: 'l3', type: 'page-link', pageId: 'page-1' } as Block,
    ]
    const out = await hydratePageLinkBlocks(sb, 'u1', blocks)
    expect(linkOf(out, 'l1')?.title).toBe('Cabinets')
    expect(linkOf(out, 'l2')?.title).toBe('Flooring')
    expect(linkOf(out, 'l3')?.title).toBe('Cabinets')
    const inMock = (sb as unknown as { from: jest.Mock }).from.mock.results[0].value.in as jest.Mock
    expect(inMock).toHaveBeenCalledTimes(1)
  })

  it('returns the blocks untouched (no fetch) when there is no page-link block', async () => {
    const sb = makePagesSupabase({})
    const blocks: Block[] = [{ id: 't1', type: 'text', content: 'hi' } as Block]
    const out = await hydratePageLinkBlocks(sb, 'u1', blocks)
    expect(out).toBe(blocks)
    expect((sb as unknown as { from: jest.Mock }).from).not.toHaveBeenCalled()
  })

  it('leaves a block whose linked page is gone (trashed/deleted) without a title', async () => {
    const sb = makePagesSupabase({})
    const blocks: Block[] = [{ id: 'l1', type: 'page-link', pageId: 'missing' } as Block]
    const out = await hydratePageLinkBlocks(sb, 'u1', blocks)
    expect(linkOf(out, 'l1')?.title).toBeUndefined()
  })

  it("serializes the linked page's current title end-to-end", async () => {
    const sb = makePagesSupabase({ 'page-1': { id: 'page-1', title: 'Cabinets' } })
    const out = await hydratePageLinkBlocks(sb, 'u1', [
      { id: 'l1', type: 'page-link', pageId: 'page-1' } as Block,
    ])
    expect(pageLinkDescriptor.serialize(linkOf(out, 'l1') as never)).toBe('Cabinets')
  })
})
