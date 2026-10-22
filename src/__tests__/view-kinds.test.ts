/**
 * The view kinds (KAN-44, ADR 0009): each kind of view is its own block to the person
 * — its own name, mark, card and empty state — over the one stored `view` carrier.
 */
import { VIEW_MODES, type ViewBlock } from '@/lib/modules/view/schema'
import { GANTT_EMPTY_LINE, LAYOUT_MENU_MODES, VIEW_KINDS, viewKind } from '@/lib/modules/view/kinds'
import { blockEmptyBox, blockFrame } from '@/lib/modules/block-frame'
import { slashRows } from '@/lib/modules/palette'
import {
  SOURCE_BLOCKS,
  footFor,
  headFor,
  sourceBlockOf,
} from '@/components/molecules/source-entries'

describe('view kinds', () => {
  it('the layout bar lists board, timeline, table, calendar, list, gallery, chart — not big number', () => {
    expect([...LAYOUT_MENU_MODES]).toEqual([
      'board',
      'gantt',
      'table',
      'calendar',
      'list',
      'gallery',
      'chart',
    ])
    expect(LAYOUT_MENU_MODES.map((mode) => VIEW_KINDS[mode].label)).toEqual([
      'board',
      'timeline',
      'table',
      'calendar',
      'list',
      'gallery',
      'chart',
    ])
    expect(LAYOUT_MENU_MODES).not.toContain('big-number')
  })

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

  it('gives every kind a mark of its own', () => {
    const marks = VIEW_MODES.map((mode) => VIEW_KINDS[mode].icon.d)
    expect(new Set(marks).size).toBe(VIEW_MODES.length)
  })

  it('a stored gantt view is a timeline wherever a person reads it', () => {
    const gantt: ViewBlock = { id: 'v', type: 'view', mode: 'gantt' }
    expect(viewKind(gantt).label).toBe('timeline')
    expect(blockFrame(gantt)?.heading).toBe('timeline')
    expect(blockEmptyBox(gantt)).toBe('void')
    expect(viewKind(gantt).empty.line).toBe(GANTT_EMPTY_LINE)
    expect(headFor('source', { block: 'gantt', pageTitle: 'plan' })).toBe('/timeline')
    expect(headFor('type', { block: 'gantt', pageTitle: 'plan', source: 'tasks' })).toBe(
      '/timeline › tasks'
    )
    expect(footFor('new', { block: 'gantt', newSelected: true })).toContain(
      'this page gets a timeline view'
    )
  })

  it('the board kind owns its empty state (KAN-377): the frame never draws "no rows yet" over its lanes', () => {
    const board: ViewBlock = { id: 'v', type: 'view', mode: 'board' }
    expect(viewKind(board).empty.own).toBe(true)
  })

  it('every stored view mode reads as its kind, with no migration', () => {
    for (const mode of VIEW_MODES) {
      const block: ViewBlock = { id: 'v', type: 'view', mode }
      expect(viewKind(block)).toBe(VIEW_KINDS[mode])
    }
  })

  it('a `/` view row is labelled and marked by its kind, never a second copy', () => {
    // `list`'s view row deliberately differs from the kind's own word ('list')
    // so it never reads alike the bulleted list's row (`bulleted-list`, label `list`).
    const viewRows = slashRows.filter((row) => row.type === 'view' && row.id !== 'list')
    expect(viewRows.length).toBeGreaterThan(0)
    for (const row of viewRows) {
      const kind = viewKind({ mode: row.id as ViewBlock['mode'] })
      expect(row.label).toBe(kind.label)
      expect(row.icon).toBe(kind.icon)
    }
  })

  it('every view kind opens the source picker before landing', () => {
    for (const mode of VIEW_MODES) {
      expect(SOURCE_BLOCKS).toContain(mode)
      expect(sourceBlockOf(mode)).toBe(mode)
    }
    // the static freeform table block bypasses the picker — it is not a view mode.
    expect(sourceBlockOf('grid')).toBeNull()
  })
})
