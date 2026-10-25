/**
 * `detachRangeKeepingRows` (KAN-373) — removing a multi-block range in one pass
 * must match calling `detachKeepingRows` once per removed block, last to first.
 */
import { detachKeepingRows, detachRangeKeepingRows } from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'

interface Block {
  id: string
  width?: BlockWidth
  rowStart?: boolean
}

function blk(id: string, width?: BlockWidth, rowStart?: boolean): Block {
  return rowStart ? { id, width, rowStart: true } : { id, width }
}

/** Rows: [a] · [b] · [c,d] (½+½) · [e,f] (⅓+⅓, a partial row). `b` and `c` carry
 *  an explicit `rowStart: true`; `e` starts its row by width overflow alone. */
const FIXTURE: Block[] = [
  blk('a', 'full'),
  blk('b', 'full', true),
  blk('c', '1/2', true),
  blk('d', '1/2'),
  blk('e', '1/3'),
  blk('f', '1/3'),
]

/** The reference behaviour: `detachKeepingRows` applied once per id, from the
 *  last original index to the first — the thing `detachRangeKeepingRows` must
 *  equal. Removing a larger index first never shifts a smaller one, so each
 *  call's index is always the block's original position. */
function applySequentially(blocks: readonly Block[], ids: ReadonlySet<string>): Block[] {
  const indices = blocks
    .map((_, i) => i)
    .filter((i) => ids.has(blocks[i].id))
    .sort((x, y) => y - x)

  let current: Block[] = [...blocks]
  for (const index of indices) {
    current = detachKeepingRows(current, index).blocks
  }
  return current
}

function idsOf(blocks: readonly Block[], start: number, end: number): Set<string> {
  return new Set(blocks.slice(start, end + 1).map((b) => b.id))
}

describe('detachRangeKeepingRows', () => {
  it('a full-width run (a, b) ending right at the ½+½ row’s own leader hands off nothing — b has no mate to hand to, and c already starts its own row', () => {
    const ids = idsOf(FIXTURE, 0, 1)
    const result = detachRangeKeepingRows(FIXTURE, ids)
    expect(result).toEqual([
      FIXTURE.find((b) => b.id === 'c'),
      FIXTURE.find((b) => b.id === 'd'),
      FIXTURE.find((b) => b.id === 'e'),
      FIXTURE.find((b) => b.id === 'f'),
    ])
  })

  it('a ½ leader plus its mate (the whole row) hands the leader’s rowStart to the block after the row', () => {
    const ids = idsOf(FIXTURE, 2, 3)
    const result = detachRangeKeepingRows(FIXTURE, ids)
    expect(result).toEqual([
      FIXTURE.find((b) => b.id === 'a'),
      FIXTURE.find((b) => b.id === 'b'),
      { id: 'e', width: '1/3', rowStart: true },
      FIXTURE.find((b) => b.id === 'f'),
    ])
  })

  it('only the leader of a ½+½ row — the mate takes rowStart', () => {
    const ids = idsOf(FIXTURE, 2, 2)
    const result = detachRangeKeepingRows(FIXTURE, ids)
    expect(result).toEqual([
      FIXTURE.find((b) => b.id === 'a'),
      FIXTURE.find((b) => b.id === 'b'),
      { id: 'd', width: '1/2', rowStart: true },
      FIXTURE.find((b) => b.id === 'e'),
      FIXTURE.find((b) => b.id === 'f'),
    ])
  })

  it('a range that ends at a row’s first member — the already-rowStart leader blocks any hand-off', () => {
    const ids = idsOf(FIXTURE, 0, 1)
    const result = detachRangeKeepingRows(FIXTURE, ids)
    expect(result[0]).toEqual(FIXTURE.find((b) => b.id === 'c'))
    expect(result[0].rowStart).toBe(true)
  })

  it('every block leaves nothing', () => {
    const ids = idsOf(FIXTURE, 0, FIXTURE.length - 1)
    expect(detachRangeKeepingRows(FIXTURE, ids)).toEqual([])
  })

  it('equals detachKeepingRows applied last-to-first, over every contiguous range of the fixture', () => {
    for (let start = 0; start < FIXTURE.length; start++) {
      for (let end = start; end < FIXTURE.length; end++) {
        const ids = idsOf(FIXTURE, start, end)
        const expected = applySequentially(FIXTURE, ids)
        const actual = detachRangeKeepingRows(FIXTURE, ids)
        expect(actual).toEqual(expected)
      }
    }
  })
})
