import { appendChildLink } from './child-links'
import type { Block } from '@/lib/modules/content'

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
