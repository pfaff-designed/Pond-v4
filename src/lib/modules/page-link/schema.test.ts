/**
 * `pageLinkSchema` + `pageLinkDescriptor`'s `serialize` (KAN-122) — a page-link
 * block carries only `pageId`; the live title is grafted on transiently by the
 * `assemble.ts` hydration seam (`HydratedPageLinkBlock`, mirroring
 * `HydratedViewBlock` in `view/schema.ts`).
 */
import { pageLinkDescriptor, pageLinkSchema, type HydratedPageLinkBlock } from './schema'

describe('pageLinkSchema', () => {
  it('parses a page-link block', () => {
    expect(pageLinkSchema.parse({ id: 'pl-1', type: 'page-link', pageId: 'page-1' })).toEqual({
      id: 'pl-1',
      type: 'page-link',
      pageId: 'page-1',
    })
  })

  it('rejects a block missing pageId', () => {
    expect(pageLinkSchema.safeParse({ id: 'pl-1', type: 'page-link' }).success).toBe(false)
  })
})

describe('pageLinkDescriptor.serialize', () => {
  it('reads the hydrated transient title when present', () => {
    const hydrated: HydratedPageLinkBlock = {
      id: 'pl-1',
      type: 'page-link',
      pageId: 'page-1',
      title: 'cabinets',
    }
    expect(pageLinkDescriptor.serialize(hydrated)).toBe('cabinets')
  })

  it('falls back to "Page link" with no hydrated title', () => {
    expect(
      pageLinkDescriptor.serialize({ id: 'pl-1', type: 'page-link', pageId: 'page-1' })
    ).toBe('Page link')
  })

  it('falls back when the hydrated title is blank', () => {
    const hydrated: HydratedPageLinkBlock = {
      id: 'pl-1',
      type: 'page-link',
      pageId: 'page-1',
      title: '   ',
    }
    expect(pageLinkDescriptor.serialize(hydrated)).toBe('Page link')
  })
})
