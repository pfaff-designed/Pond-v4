/**
 * The view kinds (KAN-44, ADR 0009): each kind of view is its own block to the person
 * — its own name, card and empty state — over the one stored `view` carrier.
 */
import { VIEW_MODES, type ViewBlock } from '@/lib/modules/view/schema'
import { GANTT_EMPTY_LINE, VIEW_KINDS, viewKind } from '@/lib/modules/view/kinds'
import { blockEmptyBox, blockFrame } from '@/lib/modules/block-frame'
import { slashRows } from '@/lib/modules/palette'

describe('view kinds', () => {
  it('names every mode in Pond’s words, lowercase', () => {
    expect(VIEW_MODES.map((mode) => VIEW_KINDS[mode].label)).toEqual([
      'table',
      'board',
      'calendar',
      'list',
      'gallery',
      'timeline',
      'chart',
      'big number',
    ])
  })

  it('a stored gantt view is a timeline wherever a person reads it', () => {
    const gantt: ViewBlock = { id: 'v', type: 'view', mode: 'gantt' }
    expect(viewKind(gantt).label).toBe('timeline')
    expect(blockFrame(gantt)?.heading).toBe('timeline')
    expect(blockEmptyBox(gantt)).toBe('void')
    expect(viewKind(gantt).empty.line).toBe(GANTT_EMPTY_LINE)
  })

  it('every stored view mode reads as its kind, with no migration', () => {
    for (const mode of VIEW_MODES) {
      const block: ViewBlock = { id: 'v', type: 'view', mode }
      expect(viewKind(block)).toBe(VIEW_KINDS[mode])
    }
  })

  it('a `/` view row is labelled by its kind, never a second copy', () => {
    const viewRows = slashRows.filter((row) => row.type === 'view')
    expect(viewRows.length).toBeGreaterThan(0)
    for (const row of viewRows) {
      expect(row.label).toBe(viewKind({ mode: row.id as ViewBlock['mode'] }).label)
    }
  })
})
