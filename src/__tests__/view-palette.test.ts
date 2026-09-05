/**
 * Palette wiring for the `view` block (#19 slice 3).
 *
 * The view block is now offered in the shared palette (its real renderers landed),
 * and a palette pick mints a table-mode view over the host page's own rows. Guards
 * both so a future registry change can't silently drop it back out or return a
 * crash-prone empty state.
 */
import { paletteItems, emptyBlockForType } from '@/lib/modules/palette'
import { moduleDescriptors } from '@/lib/modules/registry'
import { moduleRenderers } from '@/lib/modules/renderers'

describe('kanban retired from creation (#19 slice 6)', () => {
  it('kanban is NOT offered in the palette (retired from creation)', () => {
    expect(paletteItems.some((i) => i.id === 'kanban')).toBe(false)
  })

  it("table is STILL offered — it's the freeform-grid primitive, not retired", () => {
    expect(paletteItems.some((i) => i.id === 'table')).toBe(true)
  })

  it('kanban stays a registered descriptor + renderer (read/render tolerance)', () => {
    expect('kanban' in moduleDescriptors).toBe(true)
    expect('kanban' in moduleRenderers).toBe(true)
  })
})

describe('view in the block palette', () => {
  it('is offered in the palette (no longer excluded)', () => {
    expect(paletteItems.some((i) => i.id === 'view')).toBe(true)
  })

  it("still excludes the structural 'page' type", () => {
    expect(paletteItems.some((i) => i.id === 'page')).toBe(false)
  })

  it('mints a table-mode view with a fresh id as its empty state', () => {
    const block = emptyBlockForType('view')
    expect(block).not.toBeNull()
    expect(block).toMatchObject({ type: 'view', mode: 'table' })
    expect(typeof block!.id).toBe('string')
    expect(block!.id.length).toBeGreaterThan(0)
  })
})
