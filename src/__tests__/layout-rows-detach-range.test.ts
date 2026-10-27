/**
 * `detachRangeKeepingRows` (KAN-373) — removing a multi-block range in one pass
 * must match calling `detachKeepingRows` once per removed block, last to first.
 */
import { detachKeepingRows, detachRangeKeepingRows } from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'

interface Block {
  id: string
  width?: BlockWidth | number
  rowStart?: boolean
}

function blk(id: string, width?: BlockWidth | number, rowStart?: boolean): Block {
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

  it('every block leaves nothing', () => {
    const ids = idsOf(FIXTURE, 0, FIXTURE.length - 1)
    expect(detachRangeKeepingRows(FIXTURE, ids)).toEqual([])
  })

  const WIDTHS: readonly (BlockWidth | number)[] = ['full', '1/2', '1/3', '2/3', 0.25]

  /** `widths^n × rowStart^n` (5^n × 2^n) is far too large to enumerate for n up
   *  to 5 — this samples SEEDS.length layouts per block count instead, each
   *  varying every position's width and rowStart deterministically off the
   *  seed, so the sample sees every width and both rowStart states at every
   *  position without fixing either to the fixture's own choices. The id
   *  subsets of each sampled layout, in contrast, ARE checked exhaustively:
   *  2^n ≤ 32 for n ≤ 5, cheap enough that sampling them would only lose
   *  coverage for free. Total checks: SEEDS.length × Σ(2^n, n=1..5) =
   *  12 × 62 = 744 — well under the ~5s budget. */
  const SEEDS = Array.from({ length: 12 }, (_, i) => i)

  function layoutFor(n: number, seed: number): Block[] {
    return Array.from({ length: n }, (_, i) => {
      const width = WIDTHS[(seed + i * 3) % WIDTHS.length]
      const rowStart = (seed + i * 5) % 2 === 0
      return blk(`b${i}`, width, rowStart)
    })
  }

  /** Every non-empty id subset of `blocks` — contiguous and non-contiguous
   *  alike, since a subset is a subset regardless of which indices it holds. */
  function everySubset(blocks: readonly Block[]): Set<string>[] {
    const n = blocks.length
    const subsets: Set<string>[] = []
    for (let mask = 1; mask < 1 << n; mask++) {
      const ids = new Set<string>()
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) ids.add(blocks[i].id)
      }
      subsets.push(ids)
    }
    return subsets
  }

  it('equals detachKeepingRows applied last-to-first, over a deterministic sample of every layout of 1–5 blocks × widths × rowStart, for every id subset of each', () => {
    for (let n = 1; n <= 5; n++) {
      for (const seed of SEEDS) {
        const blocks = layoutFor(n, seed)
        for (const ids of everySubset(blocks)) {
          const expected = applySequentially(blocks, ids)
          const actual = detachRangeKeepingRows(blocks, ids)
          expect(actual).toEqual(expected)
        }
      }
    }
  })
})
