import { blockHoldsContent } from './block-holds-content'
import type { Block } from './content'

const text = (content: string): Block => ({ id: 't', type: 'text', content })

describe('blockHoldsContent', () => {
  it('an empty line holds nothing', () => {
    expect(blockHoldsContent(text(''))).toBe(false)
    expect(blockHoldsContent(text('   '))).toBe(false)
  })

  it('written prose, a ticked item, a filled cell, a file and a page link hold something', () => {
    expect(blockHoldsContent(text('notes'))).toBe(true)
    expect(
      blockHoldsContent({
        id: 'c',
        type: 'todo',
        items: [{ id: 'i', label: '', checked: true }],
      })
    ).toBe(true)
    expect(
      blockHoldsContent({
        id: 'g',
        type: 'table',
        columns: ['a'],
        rows: [{ id: 'r', cells: ['kept'] }],
      })
    ).toBe(true)
    expect(blockHoldsContent({ id: 'f', type: 'image', url: 'https://example.com/a.png' })).toBe(
      true
    )
    expect(blockHoldsContent({ id: 'p', type: 'page-link', pageId: 'child' })).toBe(true)
  })

  it('a bare heading or quote marker holds nothing, so ⌘⌫ skips the confirm', () => {
    expect(blockHoldsContent(text('## '))).toBe(false)
    expect(blockHoldsContent(text('> '))).toBe(false)
  })

  it('a blank log, an empty table and a toc do not', () => {
    expect(
      blockHoldsContent({
        id: 'e',
        type: 'entries',
        entries: [{ id: '1', date: 'today', text: '' }],
      })
    ).toBe(false)
    expect(
      blockHoldsContent({
        id: 'g',
        type: 'table',
        columns: ['a'],
        rows: [{ id: 'r', cells: [''] }],
      })
    ).toBe(false)
    expect(blockHoldsContent({ id: 'toc', type: 'toc' })).toBe(false)
  })
})
