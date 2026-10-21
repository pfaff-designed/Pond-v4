import { blockSchema, type Block } from './content'
import {
  HEIGHT_BODY_MIN_PX,
  HEIGHT_SNAP_PX,
  blockAcceptsHeight,
  blockWithoutHeight,
  heightFitMemory,
  measureBlockHeightBounds,
  snapBlockHeight,
  stepBlockHeight,
} from './block-height'

const table = { id: 't', type: 'table', columns: ['A'], rows: [] } as Block

describe('blockAcceptsHeight', () => {
  it('views, images and tables take a height; prose does not', () => {
    expect(blockAcceptsHeight({ type: 'view' })).toBe(true)
    expect(blockAcceptsHeight({ type: 'image' })).toBe(true)
    expect(blockAcceptsHeight({ type: 'table' })).toBe(true)
    for (const type of ['text', 'todo', 'entries', 'page-link', 'highlight']) {
      expect(blockAcceptsHeight({ type })).toBe(false)
    }
  })
})

describe('blockSchema height', () => {
  it('round-trips a pixel height and leaves an existing block unsized', () => {
    const sized = { id: '1', type: 'table' as const, columns: ['A'], rows: [], height: 420 }
    expect(blockSchema.parse(sized)).toEqual(sized)
    const plain = { id: '1', type: 'text' as const, content: 'x' }
    expect(blockSchema.parse(plain).height).toBeUndefined()
  })
})

describe('blockWithoutHeight', () => {
  it('drops a stored height and leaves an unsized block alone', () => {
    const sized = { ...table, height: 420 }
    const cleared = blockWithoutHeight(sized)
    expect(cleared).not.toHaveProperty('height')
    expect(cleared.id).toBe('t')
    expect(blockWithoutHeight(table)).toBe(table)
  })
})

describe('snapBlockHeight', () => {
  const fit = { height: 400, label: 'fit' as const }
  const notes = { height: 280, label: 'notes' }

  it.each([
    [400, 'fit', 'fit'],
    [408, 'fit', 'fit'],
    [392, 'fit', 'fit'],
    [409, '409px', null],
    [391, '391px', null],
    [280, '= notes', 'neighbour'],
    [272, '= notes', 'neighbour'],
    [288, '= notes', 'neighbour'],
    [289, '289px', null],
    [420, '420px', null],
  ] as const)('raw %ipx reads %s', (raw, readout, lockedTo) => {
    const snapped = snapBlockHeight(raw, HEIGHT_BODY_MIN_PX, [fit, notes])
    expect(snapped.readout).toBe(readout)
    expect(snapped.lockedTo).toBe(lockedTo)
    if (lockedTo === 'fit') expect(snapped.height).toBe(400)
    if (lockedTo === 'neighbour') expect(snapped.height).toBe(280)
    if (lockedTo === null) expect(snapped.height).toBe(raw)
  })

  it('locks within the snap radius and breaks out past it', () => {
    expect(HEIGHT_SNAP_PX).toBe(8)
    const atEdge = snapBlockHeight(400 + HEIGHT_SNAP_PX, 120, [fit])
    const past = snapBlockHeight(400 + HEIGHT_SNAP_PX + 1, 120, [fit])
    expect(atEdge.lockedTo).toBe('fit')
    expect(past.lockedTo).toBeNull()
    expect(past.height).toBe(409)
  })

  it('never goes below the minimum, and ignores a guide it cannot reach', () => {
    const snapped = snapBlockHeight(40, 200, [{ height: 50, label: 'fit' }])
    expect(snapped.height).toBe(200)
    expect(snapped.lockedTo).toBeNull()
    expect(snapped.readout).toBe('200px')
  })

  it('prefers fit when a neighbour is the same height', () => {
    const snapped = snapBlockHeight(400, 120, [notes, { height: 400, label: 'table' }, fit])
    expect(snapped.lockedTo).toBe('fit')
    expect(snapped.readout).toBe('fit')
  })

  it('lowercases a neighbour name', () => {
    expect(snapBlockHeight(300, 120, [{ height: 300, label: 'Kitchen' }]).readout).toBe('= kitchen')
  })
})

describe('stepBlockHeight', () => {
  it('steps and clamps to the minimum', () => {
    expect(stepBlockHeight(400, -8, 120)).toBe(392)
    expect(stepBlockHeight(400, 40, 120)).toBe(440)
    expect(stepBlockHeight(124, -8, 120)).toBe(120)
  })
})

describe('heightFitMemory', () => {
  it('an unsized block uses the live card, not a height remembered while it was still loading', () => {
    expect(heightFitMemory(undefined, 417, 149)).toBe(417)
  })

  it('a stored height keeps the content height remembered while the block was unsized', () => {
    expect(heightFitMemory(280, 280, 417)).toBe(417)
    expect(heightFitMemory(undefined, 0, 149)).toBe(149)
  })
})

describe('measureBlockHeightBounds', () => {
  function box(height: number, client = height) {
    const node = document.createElement('div')
    Object.defineProperty(node, 'offsetHeight', { value: height })
    Object.defineProperty(node, 'clientHeight', { value: client })
    return node
  }

  it('a table shorter than its pane reports the children, not the pane', () => {
    const root = box(500)
    const body = box(360, 360)
    body.setAttribute('data-part', 'view-body')
    const tableEl = box(200)
    body.appendChild(tableEl)
    root.appendChild(body)
    // chrome = 500 - 360 = 140; content = 200; fit = 340
    expect(measureBlockHeightBounds(root, null)).toEqual({ fit: 340, min: 260 })
  })

  it('a pane stretched to its content uses the height remembered while unsized', () => {
    const root = box(500)
    const plot = box(360, 360)
    plot.setAttribute('data-part', 'plot')
    plot.appendChild(box(360))
    root.appendChild(plot)
    expect(measureBlockHeightBounds(root, 410).fit).toBe(410)
  })

  it('with no measurable pane, fit is the remembered height or the card', () => {
    const root = box(410)
    expect(measureBlockHeightBounds(root, null).fit).toBe(410)
    expect(measureBlockHeightBounds(root, 380).fit).toBe(380)
    expect(measureBlockHeightBounds(root, null).min).toBeGreaterThanOrEqual(HEIGHT_BODY_MIN_PX)
  })
})
