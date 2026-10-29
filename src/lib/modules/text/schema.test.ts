/**
 * KAN-515: `toggle`/`folded` on `textSchema` — both optional, absent means today's
 * behaviour (an ordinary heading, unfolded). Pins the round-trip through the
 * persisted union (`blockSchema`), not just `textSchema` alone.
 */
import { blockSchema } from '@/lib/modules/content'
import type { TextBlock } from './schema'

describe('textSchema — toggle/folded', () => {
  it('round-trips a block with both fields set through blockSchema.parse', () => {
    const block = { id: 'b-1', type: 'text', content: '# Heading', toggle: true, folded: true }
    expect(blockSchema.parse(block)).toEqual(block)
  })

  it('round-trips a block with neither field set, absent on the far side', () => {
    const block = { id: 'b-2', type: 'text', content: '# Heading' }
    const parsed = blockSchema.parse(block)
    expect(parsed).toEqual(block)
    expect('toggle' in parsed).toBe(false)
    expect('folded' in parsed).toBe(false)
  })

  it('rejects non-boolean toggle/folded', () => {
    expect(
      blockSchema.safeParse({ id: 'b-3', type: 'text', content: 'x', toggle: 'yes' }).success
    ).toBe(false)
    expect(
      blockSchema.safeParse({ id: 'b-4', type: 'text', content: 'x', folded: 1 }).success
    ).toBe(false)
  })

  it('TextBlock carries both fields in its type', () => {
    const block: TextBlock = { id: 'b-5', type: 'text', content: 'x', toggle: true, folded: false }
    expect(block.toggle).toBe(true)
    expect(block.folded).toBe(false)
  })
})
