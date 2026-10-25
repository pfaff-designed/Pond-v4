import { removedOnExit } from '@/lib/modules/block-holds-content'
import type { Block } from '@/lib/modules/content'

describe('removedOnExit (KAN-558)', () => {
  it('an empty text line is removed', () => {
    const block: Block = { id: 't', type: 'text', content: '' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('a text line with content stays', () => {
    const block: Block = { id: 't', type: 'text', content: 'kept' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a bare heading marker is removed (commit 21dd357d)', () => {
    const block: Block = { id: 't', type: 'text', content: '## ' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('whitespace-only text is removed', () => {
    const block: Block = { id: 't', type: 'text', content: '   ' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('a bare `#` with nothing after it is removed', () => {
    const block: Block = { id: 't', type: 'text', content: '#' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('a heading with a word stuck to the `#` stays', () => {
    const block: Block = { id: 't', type: 'text', content: '#tag' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a labelled heading stays', () => {
    const block: Block = { id: 't', type: 'text', content: '## labelled text' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an empty quote marker is removed', () => {
    const block: Block = { id: 't', type: 'text', content: '> ' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('a quote with words stays', () => {
    const block: Block = { id: 't', type: 'text', content: '> quoted words' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an empty numbered-list marker is removed', () => {
    const block: Block = { id: 't', type: 'text', content: '1. ' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('an empty code fence is removed', () => {
    const block: Block = { id: 't', type: 'text', content: '```\n\n```' }
    expect(removedOnExit(block)).toBe(true)
  })

  it('an empty highlight stays — it is not a text block, by decision', () => {
    const block: Block = { id: 'h', type: 'highlight', content: '' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a text block the person labelled stays, even empty', () => {
    const block: Block = { id: 't', type: 'text', content: '', label: 'goal' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an empty todo stays', () => {
    const block: Block = {
      id: 'c',
      type: 'todo',
      items: [{ id: 'i', label: '', checked: false }],
    }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a todo with an item stays', () => {
    const block: Block = {
      id: 'c',
      type: 'todo',
      items: [{ id: 'i', label: 'first step', checked: false }],
    }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an empty table stays', () => {
    const block: Block = {
      id: 'g',
      type: 'table',
      columns: ['a'],
      rows: [{ id: 'r', cells: [''] }],
    }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an empty log of entries stays', () => {
    const block: Block = {
      id: 'e',
      type: 'entries',
      entries: [{ id: '1', date: 'today', text: '' }],
    }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an image stays', () => {
    const block: Block = { id: 'f', type: 'image', url: '' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a view stays', () => {
    const block: Block = { id: 'v', type: 'view', mode: 'list' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a page link stays', () => {
    const block: Block = { id: 'p', type: 'page-link', pageId: 'child' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('a table of contents stays', () => {
    const block: Block = { id: 'toc', type: 'toc' }
    expect(removedOnExit(block)).toBe(false)
  })

  it('an empty toggle stays', () => {
    const block: Block = { id: 'tg', type: 'toggle', content: '' }
    expect(removedOnExit(block)).toBe(false)
  })
})
