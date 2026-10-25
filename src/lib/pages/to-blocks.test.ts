/**
 * `toBlocks` has one home (KAN-552): `client.ts`'s `mapRow`, `home.ts`'s
 * readers, and `templates/client.ts`'s `mapRow` all read through it, so a
 * stored multi-paragraph `text` block splits the same way everywhere.
 */

import { toBlocks } from './to-blocks'
import { getPage } from './client'
import { getOrCreateHomePage } from './home'
import { getTemplate } from '@/lib/templates/client'

const multiParagraphBlock = {
  id: 'b1',
  type: 'text' as const,
  content: 'alpha\n\nbeta',
}

describe('toBlocks', () => {
  it('splits a multi-paragraph text block and coerces non-arrays to []', () => {
    expect(toBlocks([multiParagraphBlock])).toEqual([
      { id: 'b1', type: 'text', content: 'alpha' },
      { id: 'b1-2', type: 'text', content: 'beta' },
    ])
    expect(toBlocks(null)).toEqual([])
    expect(toBlocks(undefined)).toEqual([])
    expect(toBlocks('not an array')).toEqual([])
  })
})

// ── client.ts's mapRow (via getPage) ────────────────────────────────────────

function makePagesChain(row: Record<string, unknown> | null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  }
  return { from: jest.fn().mockReturnValue(chain) }
}

describe('toBlocks through client.ts (getPage → mapRow)', () => {
  it('a stored multi-paragraph text block reads as split blocks', async () => {
    const sb = makePagesChain({
      id: 'page-1',
      parent_id: null,
      type: 'page',
      title: 'Notes',
      blocks: [multiParagraphBlock],
      props: {},
      order: 0,
    })
    const result = await getPage(sb as never, 'page-1')
    expect(result!.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'alpha' },
      { id: 'b1-2', type: 'text', content: 'beta' },
    ])
  })
})

// ── home.ts's readers (via getOrCreateHomePage) ─────────────────────────────

function makeHomeSupabase(row: Record<string, unknown>) {
  const builder: Record<string, unknown> = {
    select() {
      return builder
    },
    eq() {
      return builder
    },
    is() {
      return builder
    },
    limit() {
      return builder
    },
    maybeSingle() {
      return Promise.resolve({ data: row, error: null })
    },
  }
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: () => builder,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('toBlocks through home.ts (getOrCreateHomePage)', () => {
  it('the Life home row reads as split blocks', async () => {
    const sb = makeHomeSupabase({
      id: 'home-1',
      user_id: 'u1',
      pond_id: 'pond-1',
      parent_id: null,
      type: 'home',
      title: 'Untitled',
      blocks: [multiParagraphBlock],
    })
    const home = await getOrCreateHomePage(sb, 'pond-1')
    expect(home!.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'alpha' },
      { id: 'b1-2', type: 'text', content: 'beta' },
    ])
  })
})

// ── templates/client.ts's mapRow (via getTemplate) ──────────────────────────

function makeTemplatesChain(row: Record<string, unknown> | null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  }
  return { from: jest.fn().mockReturnValue(chain) }
}

describe('toBlocks through templates/client.ts (getTemplate → mapRow)', () => {
  it('a stored multi-paragraph text block reads as split blocks', async () => {
    const sb = makeTemplatesChain({
      id: 'tpl-1',
      name: 'My template',
      kind: 'page',
      blocks: [multiParagraphBlock],
      origin: 'yours',
      created_at: '2026-10-20T00:00:00Z',
      updated_at: '2026-10-20T00:00:00Z',
    })
    const result = await getTemplate(sb as never, 'tpl-1')
    expect(result!.blocks).toEqual([
      { id: 'b1', type: 'text', content: 'alpha' },
      { id: 'b1-2', type: 'text', content: 'beta' },
    ])
  })
})
