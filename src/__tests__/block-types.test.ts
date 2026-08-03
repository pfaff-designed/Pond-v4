import type { Block, TextBlock, TodoBlock, MetricBlock } from '@/lib/documents/types'

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

  it('metric block has optional unit and trend', () => {
    const block: MetricBlock = { id: 'ghi', type: 'metric', label: 'Revenue', value: 1000 }
    expect(block.unit).toBeUndefined()
    expect(block.trend).toBeUndefined()
  })

  it('Block union covers all three types', () => {
    const blocks: Block[] = [
      { id: '1', type: 'text', content: 'x' },
      { id: '2', type: 'todo', items: [] },
      { id: '3', type: 'metric', label: 'MRR', value: 500, unit: '$', trend: 'up' },
    ]
    expect(blocks).toHaveLength(3)
  })
})
