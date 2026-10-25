/**
 * `planStepMove` / `planRowSwap` (KAN-376) — ⌥↑/⌥↓ and ⌥←/⌥→ planners: a row
 * never renders split by a moved block.
 */
import { layoutRows, planRowSwap, planStepMove, rowStacks } from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'

interface Block {
  id: string
  width?: BlockWidth
  rowStart?: boolean
}

const WIDE_COLUMN_PX = 2000 // wide enough that no row in these tests draws stacked.
const NARROW_COLUMN_PX = 992 // narrow enough that a ¼ member draws stacked.

function blk(id: string, width?: BlockWidth, rowStart?: boolean): Block {
  return rowStart ? { id, width, rowStart: true } : { id, width }
}

describe('planStepMove', () => {
  it('a full block above a ½+½ row steps down past the whole row, which stays intact', () => {
    const full = blk('full')
    const left = blk('left', '1/2', true)
    const right = blk('right', '1/2')
    const blocks = [full, left, right]

    const result = planStepMove(blocks, 0, 'down')!
    expect(result.map((b) => b.id)).toEqual(['left', 'right', 'full'])
    expect(result.find((b) => b.id === 'full')).toMatchObject({ rowStart: true })
    expect(
      layoutRows(result).some(
        (row) => row.length === 2 && row.every((b) => ['left', 'right'].includes(b.id))
      )
    ).toBe(true)
  })

  it('the left half of a ½+½ row steps down onto its own full line below; the right half keeps ½', () => {
    const left = blk('left', '1/2', true)
    const right = blk('right', '1/2')
    const blocks = [left, right]

    const result = planStepMove(blocks, 0, 'down')!
    expect(result).toEqual([
      { id: 'right', width: '1/2', rowStart: true },
      { id: 'left', width: 'full', rowStart: true },
    ])
    expect(layoutRows(result)).toEqual([[result[0]], [result[1]]])
  })

  it('the right half of a ½+½ row steps up onto its own full line above; the left half keeps ½', () => {
    const left = blk('left', '1/2', true)
    const right = blk('right', '1/2')
    const blocks = [left, right]

    const result = planStepMove(blocks, 1, 'up')!
    expect(result).toEqual([
      { id: 'right', width: 'full', rowStart: true },
      { id: 'left', width: '1/2', rowStart: true },
    ])
  })

  it('⌥↑ on the first block (alone on its own line, nothing above) is null', () => {
    const full = blk('full')
    const left = blk('left', '1/2', true)
    const right = blk('right', '1/2')
    const blocks = [full, left, right]

    expect(planStepMove(blocks, 0, 'up')).toBeNull()
  })

  it('⌥↓ on the last block, alone on its own line with nothing below, is null', () => {
    const a = blk('a')
    const b = blk('b')
    const blocks = [a, b]

    expect(planStepMove(blocks, 1, 'down')).toBeNull()
  })

  it('the middle of a ⅓+⅓+⅓ row steps up onto its own line above; the outer two stay one row', () => {
    const left = blk('left', '1/3', true)
    const middle = blk('middle', '1/3')
    const rightB = blk('right', '1/3')
    const blocks = [left, middle, rightB]

    const result = planStepMove(blocks, 1, 'up')!
    expect(result.map((b) => b.id)).toEqual(['middle', 'left', 'right'])
    expect(result.find((b) => b.id === 'middle')).toMatchObject({ width: 'full', rowStart: true })
    expect(layoutRows(result)).toEqual([
      [result[0]],
      [result[1], result[2]],
    ])
  })

  it('the middle of a ⅓+⅓+⅓ row steps down onto its own line below; the outer two stay one row', () => {
    const left = blk('left', '1/3', true)
    const middle = blk('middle', '1/3')
    const rightB = blk('right', '1/3')
    const blocks = [left, middle, rightB]

    const result = planStepMove(blocks, 1, 'down')!
    expect(result.map((b) => b.id)).toEqual(['left', 'right', 'middle'])
    expect(result.find((b) => b.id === 'middle')).toMatchObject({ width: 'full', rowStart: true })
    expect(layoutRows(result)).toEqual([
      [result[0], result[1]],
      [result[2]],
    ])
  })

  it('a row at the very end of the page: stepping its block down lands below, still at the end, mate keeping its width', () => {
    const a = blk('a')
    const left = blk('left', '1/2', true)
    const right = blk('right', '1/2')
    const blocks = [a, left, right]

    const result = planStepMove(blocks, 1, 'down')!
    expect(result).toEqual([
      a,
      { id: 'right', width: '1/2', rowStart: true },
      { id: 'left', width: 'full', rowStart: true },
    ])
  })

  it('a ½ block alone on its own line keeps ½ when it jumps past the row above it', () => {
    const a = blk('a')
    const half = blk('half', '1/2', true)
    const blocks = [a, half]

    const result = planStepMove(blocks, 1, 'up')!
    expect(result).toEqual([
      { id: 'half', width: '1/2', rowStart: true },
      { id: 'a', rowStart: true },
    ])
    expect(layoutRows(result)).toEqual([[result[0]], [result[1]]])
  })

  // `planStepMove` plans over STORED rows only (`layoutRows`) — never over how
  // a row happens to be drawn. A ¼+¾ row draws stacked at a narrow column
  // (¼ of 992px is under MIN_BLOCK_WIDTH_PX) and side by side at a wide one,
  // but the plan is identical either way: there is no `columnWidthPx` param
  // for drawn-ness to leak through anymore.
  describe('a stored row that may draw stacked (6x: planning never depends on how it is drawn)', () => {
    const creative = blk('creative', '1/4', true)
    const professional = blk('professional', '3/4')

    it('confirms the fixture actually draws stacked narrow and side by side wide', () => {
      expect(rowStacks(NARROW_COLUMN_PX, ['1/4', '3/4'])).toBe(true)
      expect(rowStacks(WIDE_COLUMN_PX, ['1/4', '3/4'])).toBe(false)
    })

    it('a full block above a ¼+¾ row steps down past the WHOLE row, which stays one stored row', () => {
      const calendar = blk('calendar', 'full', true)
      const trailerLeft = blk('trailerLeft', '1/2', true)
      const trailerRight = blk('trailerRight', '1/2')
      const blocks = [calendar, creative, professional, trailerLeft, trailerRight]

      const result = planStepMove(blocks, 0, 'down')!
      expect(result.map((b) => b.id)).toEqual([
        'creative',
        'professional',
        'calendar',
        'trailerLeft',
        'trailerRight',
      ])
      expect(result.find((b) => b.id === 'calendar')).toMatchObject({ rowStart: true })
      expect(layoutRows(result)).toEqual([
        [result[0], result[1]],
        [result[2]],
        [result[3], result[4]],
      ])
    })

    it('⌥↑ on the ¾ member of a ¼+¾ row leaves it onto its own full line above; the ¼ member keeps ¼', () => {
      const trailerLeft = blk('trailerLeft', '1/2', true)
      const trailerRight = blk('trailerRight', '1/2')
      const blocks = [creative, professional, trailerLeft, trailerRight]

      const result = planStepMove(blocks, 1, 'up')!
      expect(result).toEqual([
        { id: 'professional', width: 'full', rowStart: true },
        { id: 'creative', width: '1/4', rowStart: true },
        { id: 'trailerLeft', width: '1/2', rowStart: true },
        { id: 'trailerRight', width: '1/2' },
      ])
      // The untouched trailer row stays grouped together even though its position shifted.
      expect(layoutRows(result)).toEqual([
        [result[0]],
        [result[1]],
        [result[2], result[3]],
      ])
    })
  })

  // Lifting a solo block out of the middle of the page can open a seam its own
  // row never touched: `detachKeepingRows` only hands `rowStart` on within the
  // removed block's own row, so a follower that started a fresh row before the
  // move must keep doing so after — otherwise it silently re-packs with
  // whatever now precedes it.
  describe('a solo block lifted from the middle must not let its neighbours re-pack (KAN-376 regression)', () => {
    it('⌥↑ on a solo full block between two ½ blocks on their own lines leaves three separate lines', () => {
      const c = blk('c', '1/2')
      const x = blk('x', 'full')
      const e = blk('e', '1/2')
      const blocks = [c, x, e]

      const result = planStepMove(blocks, 1, 'up')!
      expect(result.map((b) => b.id)).toEqual(['x', 'c', 'e'])
      expect(layoutRows(result)).toEqual([[result[0]], [result[1]], [result[2]]])
    })

    it('⌥↓ on the same solo block leaves three separate lines the other way', () => {
      const c = blk('c', '1/2')
      const x = blk('x', 'full')
      const e = blk('e', '1/2')
      const blocks = [c, x, e]

      const result = planStepMove(blocks, 1, 'down')!
      expect(result.map((b) => b.id)).toEqual(['c', 'e', 'x'])
      expect(layoutRows(result)).toEqual([[result[0]], [result[1]], [result[2]]])
    })

    it('the same seam at ⅓ widths', () => {
      const c = blk('c', '1/3')
      const x = blk('x', 'full')
      const e = blk('e', '1/3')

      const up = planStepMove([c, x, e], 1, 'up')!
      expect(layoutRows(up)).toEqual([[up[0]], [up[1]], [up[2]]])

      const down = planStepMove([c, x, e], 1, 'down')!
      expect(layoutRows(down)).toEqual([[down[0]], [down[1]], [down[2]]])
    })

    it('does not over-apply: a follower that was already a row-mate (not alone) stays one', () => {
      const x = blk('x', 'full')
      const c = blk('c', '1/2')
      const e = blk('e', '1/2')
      const blocks = [x, c, e]

      const result = planStepMove(blocks, 0, 'down')!
      expect(result.map((b) => b.id)).toEqual(['c', 'e', 'x'])
      expect(layoutRows(result)).toEqual([[result[0], result[1]], [result[2]]])
    })
  })

  // A block leaving a 2+ row leaves its mate behind at the mate's own width
  // (`widenLoneMate: false`) — so the mate still has room, and the stored
  // line after the row may have relied on the row being full to start a
  // line of its own. Without a guard, that line silently re-packs with the
  // mate once the row is no longer full (KAN-376 regression, round 3).
  describe('a block leaving a 2+ row must not let the next stored line re-pack with the mate (KAN-376 regression, round 3)', () => {
    it('⌥↓ on the left half of a ½+½ row: the right half and the next ½ line both stay alone', () => {
      const left = blk('left', '1/2')
      const right = blk('right', '1/2')
      const n = blk('n', '1/2')
      const blocks = [left, right, n]

      const result = planStepMove(blocks, 0, 'down')!
      expect(layoutRows(result)).toEqual([[result[0]], [result[1]], [result[2]]])
      expect(result.find((b) => b.id === 'right')).toMatchObject({ width: '1/2' })
      expect(result.find((b) => b.id === 'n')).toMatchObject({ width: '1/2' })
      expect(result.find((b) => b.id === 'left')).toMatchObject({ width: 'full', rowStart: true })
    })

    it('⌥↑ on the left half of the same row: the right half and the next ½ line both stay alone', () => {
      const left = blk('left', '1/2')
      const right = blk('right', '1/2')
      const n = blk('n', '1/2')
      const blocks = [left, right, n]

      const result = planStepMove(blocks, 0, 'up')!
      expect(layoutRows(result)).toEqual([[result[0]], [result[1]], [result[2]]])
      expect(result.find((b) => b.id === 'right')).toMatchObject({ width: '1/2' })
      expect(result.find((b) => b.id === 'n')).toMatchObject({ width: '1/2' })
    })

    it('⌥↑ on the right half of the same row: the left half and the next ½ line both stay alone', () => {
      const left = blk('left', '1/2')
      const right = blk('right', '1/2')
      const n = blk('n', '1/2')
      const blocks = [left, right, n]

      const result = planStepMove(blocks, 1, 'up')!
      expect(layoutRows(result)).toEqual([[result[0]], [result[1]], [result[2]]])
      expect(result.find((b) => b.id === 'left')).toMatchObject({ width: '1/2' })
      expect(result.find((b) => b.id === 'n')).toMatchObject({ width: '1/2' })
    })

    it('the same seam at ¼+¾ widths', () => {
      const left = blk('left', '1/4')
      const right = blk('right', '3/4')
      const n = blk('n', '1/2')
      const blocks = [left, right, n]

      const down = planStepMove(blocks, 0, 'down')!
      expect(layoutRows(down)).toEqual([[down[0]], [down[1]], [down[2]]])

      const up = planStepMove(blocks, 1, 'up')!
      expect(layoutRows(up)).toEqual([[up[0]], [up[1]], [up[2]]])
    })
  })
})

describe('planRowSwap', () => {
  it('swaps the two halves of a ½+½ row; rowStart stays with the first slot', () => {
    const left = blk('left', '1/2', true)
    const right = blk('right', '1/2')
    const blocks = [left, right]

    expect(planRowSwap(blocks, 0, 'right')).toEqual([
      { id: 'right', width: '1/2', rowStart: true },
      { id: 'left', width: '1/2' },
    ])
    expect(planRowSwap(blocks, 1, 'left')).toEqual([
      { id: 'right', width: '1/2', rowStart: true },
      { id: 'left', width: '1/2' },
    ])
  })

  it('swaps within a ⅓+⅓+⅓ row; rowStart always stays on the first slot', () => {
    const left = blk('left', '1/3', true)
    const middle = blk('middle', '1/3')
    const rightB = blk('right', '1/3')
    const blocks = [left, middle, rightB]

    expect(planRowSwap(blocks, 1, 'left')).toEqual([
      { id: 'middle', width: '1/3', rowStart: true },
      { id: 'left', width: '1/3' },
      { id: 'right', width: '1/3' },
    ])
    expect(planRowSwap(blocks, 1, 'right')).toEqual([
      { id: 'left', width: '1/3', rowStart: true },
      { id: 'right', width: '1/3' },
      { id: 'middle', width: '1/3' },
    ])
  })

  it('refuses a swap at the row edge: the first block left, the last block right', () => {
    const left = blk('left', '1/3', true)
    const middle = blk('middle', '1/3')
    const rightB = blk('right', '1/3')
    const blocks = [left, middle, rightB]

    expect(planRowSwap(blocks, 0, 'left')).toBeNull()
    expect(planRowSwap(blocks, 2, 'right')).toBeNull()
  })

  it('refuses a swap when the block is alone in its row', () => {
    const a = blk('a')
    const blocks = [a]

    expect(planRowSwap(blocks, 0, 'left')).toBeNull()
    expect(planRowSwap(blocks, 0, 'right')).toBeNull()
  })
})
