import type { Block, TextBlock, TodoBlock } from '@/lib/documents/types'

describe('Block types', () => {
  it('text block has expected shape', () => {
    const block: TextBlock = { id: 'abc', type: 'text', content: '# Hello' }
    expect(block.type).toBe('text')
    expect(block.content).toBe('# Hello')
  })

  it('todo block items have id + label + checked', () => {
    const block: TodoBlock = {
      id: 'def',
      type: 'todo',
      items: [{ id: 'item-1', label: 'Do thing', checked: false }],
    }
    expect(block.items[0].checked).toBe(false)
  })

  it('Block union covers the content types', () => {
    const blocks: Block[] = [
      { id: '1', type: 'text', content: 'x' },
      { id: '2', type: 'todo', items: [] },
      { id: '3', type: 'table', columns: ['A'], rows: [{ id: 'r1', cells: ['x'] }] },
      { id: '4', type: 'view', mode: 'table' },
      { id: '5', type: 'image', url: 'https://cdn.example/a.png' },
      { id: '6', type: 'highlight', content: 'a line worth keeping' },
      { id: '7', type: 'entries', entries: [{ id: 'e1', date: '28 oct', text: 'Van booked.' }] },
    ]
    expect(blocks).toHaveLength(7)
  })
})
