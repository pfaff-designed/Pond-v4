import { blockSchema } from '@/lib/modules/content'

describe('blockSchema width (KAN-43)', () => {
  it('round-trips a block with a width', () => {
    const block = { id: '1', type: 'text', content: 'x', width: '1/2' }
    expect(blockSchema.parse(block)).toEqual(block)
  })

  it('round-trips a block with no width as undefined (an existing page is unchanged)', () => {
    const block = { id: '1', type: 'text', content: 'x' }
    expect(blockSchema.parse(block).width).toBeUndefined()
  })
})
