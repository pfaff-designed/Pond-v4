/**
 * `blockCount` (KAN-122 fix) — a new nested page is born with one empty text
 * line to type into (6a frame 5's `pondStampAt` prose block); that line holds
 * nothing, so it must not count. Every other block, and a text block with
 * real content, counts as before.
 */
import { blockCount } from './use-block-count'

const emptyText = { id: 'b-1', type: 'text', content: '' }
const whitespaceText = { id: 'b-2', type: 'text', content: '   \n' }
const filledText = { id: 'b-3', type: 'text', content: 'Cabinets are the only open cost.' }
const todo = { id: 'b-4', type: 'todo', checked: false, content: 'Pick a backsplash' }

describe('blockCount', () => {
  it('does not count an empty text block', () => {
    expect(blockCount([emptyText])).toBe(0)
  })

  it('does not count a whitespace-only text block', () => {
    expect(blockCount([whitespaceText])).toBe(0)
  })

  it('counts a filled text block and a non-text block, skipping the empty one', () => {
    expect(blockCount([emptyText, filledText, todo])).toBe(2)
  })

  it('counts everything when nothing is empty', () => {
    expect(blockCount([filledText, todo])).toBe(2)
  })

  it('is 0 for no blocks or a non-array value', () => {
    expect(blockCount([])).toBe(0)
    expect(blockCount(null)).toBe(0)
    expect(blockCount(undefined)).toBe(0)
  })
})
