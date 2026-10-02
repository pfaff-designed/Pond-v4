/**
 * Palette wiring for the `view` block (#19 slice 3).
 *
 * The view block is offered in the shared palette (its real renderers landed), and a
 * palette pick mints a table-mode view over the host page's own rows. Guards both so
 * a future registry change can't silently drop it back out or return a crash-prone
 * empty state.
 */
import { paletteItems, emptyBlockForType } from '@/lib/modules/palette'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'

describe('view in the block palette', () => {
  it('is offered in the palette (no longer excluded)', () => {
    expect(paletteItems.some((i) => i.id === 'view')).toBe(true)
  })

  it("still excludes the structural 'page' type", () => {
    expect(paletteItems.some((i) => i.id === 'page')).toBe(false)
  })

  it("table is STILL offered — it's the freeform-grid primitive", () => {
    expect(paletteItems.some((i) => i.id === 'table')).toBe(true)
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
    expect(paletteItems.some((i) => i.id === type)).toBe(false)
    expect(emptyBlockForType(type)).toBeNull()
  })

  it('every registered content type is offered — `page` is the only exclusion', () => {
    const registered = Object.keys(moduleDescriptors).filter((t) => t !== 'page')
    // `board` is a preset that mints a `view`, not a type of its own.
    const offered = paletteItems.map((i) => i.id).filter((id) => id !== 'board')
    expect(offered.sort()).toEqual(registered.sort())
  })

  it('leaves the palette with the live authoring vocabulary only', () => {
    expect(paletteItems.map((i) => i.id).sort()).toEqual(
      ['board', 'highlight', 'image', 'table', 'text', 'todo', 'view'].sort()
    )
  })
})
