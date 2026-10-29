import { blockSchema } from './content'

describe('blockSchema column (KAN-570)', () => {
  it('round-trips a block with a column', () => {
    const block = { id: '1', type: 'text', content: 'x', column: 'a' }
    expect(blockSchema.parse(block)).toEqual(block)
  })

  it('round-trips a block with no column as undefined (an existing page is unchanged)', () => {
    const block = { id: '1', type: 'text', content: 'x' }
    expect(blockSchema.parse(block).column).toBeUndefined()
  })
})
