/**
 * Palette wiring for the `view` block (#19 slice 3).
 *
 * The view block is offered in the shared palette (its real renderers landed), and a
 * palette pick mints a table-mode view over the host page's own rows. Guards both so
 * a future registry change can't silently drop it back out or return a crash-prone
 * empty state.
 */
import { slashRows, emptyBlockForType, mintPreset } from '@/lib/modules/palette'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'

describe('view in the / menu', () => {
  it('is offered — through its modes (gallery, chart, big number), never as a plain `view` row (#278)', () => {
    expect(slashRows.some((r) => r.type === 'view')).toBe(true)
    expect(slashRows.some((r) => r.label === 'view')).toBe(false)
  })

  it("still excludes the structural 'page' type", () => {
    expect(slashRows.some((r) => r.type === 'page')).toBe(false)
  })

  it("table is STILL offered — it's the freeform-grid primitive", () => {
    expect(slashRows.some((r) => r.type === 'table')).toBe(true)
  })

  it('mints a table-mode view with a fresh id as its empty state', () => {
    const block = emptyBlockForType('view')
    expect(block).not.toBeNull()
    expect(block).toMatchObject({ type: 'view', mode: 'table' })
    expect(typeof block!.id).toBe('string')
    expect(block!.id.length).toBeGreaterThan(0)
  })
})

/**
 * #111 is finished. The nine data-HOLDING display blocks are DELETED, not retired-
 * but-registered: production held zero of them across all 85 pages, so there was
 * nothing left to be read-tolerant OF. A chart and a headline figure are modes of the
 * `view` block; a board is its board mode.
 *
 * The consequence this pins: the registry IS the palette again. There is no longer a
 * second, hidden tier of "registered but unmintable" types, so anything registered is
 * offered — the only exclusion left is the structural `page` container.
 */
describe('the deleted data-holding display blocks (#111)', () => {
  const deleted = [
    'kanban',
    'chart-line',
    'chart-bar',
    'chart-area',
    'heatmap',
    'timeline',
    'metric',
    'metric-ring',
    'stat',
  ]

  it.each(deleted)('%s is gone from the descriptor and renderer maps', (type) => {
    expect(type in moduleDescriptors).toBe(false)
    expect(type in moduleRenderers).toBe(false)
  })

  it.each(deleted)('%s mints nothing from the palette', (type) => {
    expect(slashRows.some((r) => r.type === type || r.id === type)).toBe(false)
    expect(emptyBlockForType(type)).toBeNull()
  })

  it('every registered content type is reached by a row — `page` is the only exclusion', () => {
    const registered = Object.keys(moduleDescriptors).filter((t) => t !== 'page')
    const reached = [...new Set(slashRows.map((r) => r.type).filter((t): t is string => !!t))]
    expect(reached.sort()).toEqual(registered.sort())
  })

  it('the `board` row makes a view block in board mode, not a data-holding board (ADR 0009)', () => {
    expect(slashRows.find((r) => r.id === 'board')?.type).toBe('view')
    expect(mintPreset('board')).toMatchObject({ type: 'view', mode: 'board' })
  })
})
