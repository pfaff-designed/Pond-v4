import type { Block } from '@/lib/documents/types'
import { landAtSlash, type SlashTarget } from './use-slash-pick'

const table: Block = { id: 'b-table', type: 'table', columns: ['Tool'], rows: [] }
const picked: Block = { id: 'todo-1', type: 'todo', items: [] }
const host: Block = { id: 'b-text', type: 'text', content: 'above\n\n/\n\nbelow' }
const line = { before: 'above', markdown: '/', after: 'below', query: '' }
const target: SlashTarget = { hostId: 'b-text', content: host.content, line }

describe('landAtSlash', () => {
  it('splits the host around the pick, and puts the `/` back as a line of its own on undo', () => {
    const landing = landAtSlash([table, host], target, picked)
    expect(landing?.next).toEqual([
      table,
      { id: 'b-text', type: 'text', content: 'above' },
      picked,
      { id: expect.any(String), type: 'text', content: 'below' },
    ])
    expect(landing?.landed).toBe(picked)
    expect(landing?.slash).toEqual({ id: expect.any(String), type: 'text', content: '/' })
  })

  it('a `/…` block is replaced whole, and undo brings the block back', () => {
    const slashBlock: Block = { id: 'b-text', type: 'text', content: '/che' }
    const landing = landAtSlash(
      [slashBlock, table],
      { hostId: 'b-text', content: '/che', line: null },
      picked
    )
    expect(landing?.next).toEqual([picked, table])
    expect(landing?.slash).toBe(slashBlock)
  })

  it('a host edited since the pick began is kept, with the pick after it', () => {
    const edited: Block = { ...host, content: 'above\n\n/\n\nbelow, and more' }
    const landing = landAtSlash([edited, table], target, picked)
    expect(landing?.next).toEqual([edited, picked, table])
    expect(landing?.slash).toBeNull()
  })

  it('nothing lands when the host is gone', () => {
    expect(landAtSlash([table], target, picked)).toBeNull()
  })

  it('a page pick takes only the `/` line away', () => {
    expect(landAtSlash([host], target, null)?.next).toEqual([
      { id: 'b-text', type: 'text', content: 'above' },
      { id: expect.any(String), type: 'text', content: 'below' },
    ])
  })
})
