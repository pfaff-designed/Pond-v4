import type { Block } from '@/lib/modules/content'
import { ICON } from '@/components/molecules/slash-entries'
import { templateOutlineRows } from './preview'
import { PREMADE_TEMPLATES } from './premade'
import { instantiateTemplate } from './instantiate'

/** 6f frame 3's recipe example: `big number — time, list — ingredients, checklist —
 *  method, entry log — cooked, text — notes`. */
const RECIPE: Block[] = [
  { id: '1', type: 'view', mode: 'big-number', label: 'time' },
  { id: '2', type: 'todo', marker: 'dot', label: 'ingredients', items: [] },
  { id: '3', type: 'todo', marker: 'check', label: 'method', items: [] },
  { id: '4', type: 'entries', label: 'cooked', entries: [] },
  { id: '5', type: 'text', label: 'notes', content: '' },
]

describe('templateOutlineRows', () => {
  it('reads the recipe example', () => {
    expect(templateOutlineRows(RECIPE)).toEqual([
      { kind: 'big number', label: 'time', height: 92, icon: ICON.number },
      { kind: 'list', label: 'ingredients', height: 110, icon: ICON.list },
      { kind: 'checklist', label: 'method', height: 110, icon: ICON.check },
      { kind: 'entry log', label: 'cooked', height: 44, icon: ICON.log },
      { kind: 'text', label: 'notes', height: 44, icon: ICON.text },
    ])
  })

  it('reads a table by its title, not a label', () => {
    const block: Block = { id: 't', type: 'table', title: 'ingredients', columns: ['a'], rows: [] }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'table', label: 'ingredients', height: 110, icon: ICON.table },
    ])
  })

  it('reads a gallery view by its mode', () => {
    const block: Block = { id: 'g', type: 'view', mode: 'gallery', label: 'records' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'gallery', label: 'records', height: 110, icon: ICON.gallery },
    ])
  })

  it('reads a chart view by its mode', () => {
    const block: Block = { id: 'c', type: 'view', mode: 'chart', label: 'by week' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'chart', label: 'by week', height: 110, icon: ICON.chart },
    ])
  })

  it('reads a board view by its mode', () => {
    const block: Block = { id: 'b', type: 'view', mode: 'board', label: 'tasks' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'board', label: 'tasks', height: 110, icon: ICON.board },
    ])
  })

  it('reads a timeline (gantt) view by its mode, with no height/icon map entry to go missing', () => {
    const block: Block = { id: 'tl', type: 'view', mode: 'gantt', label: 'schedule' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'timeline', label: 'schedule', height: 110, icon: ICON.timeline },
    ])
  })

  it('reads a calendar view by its mode, with no height/icon map entry to go missing', () => {
    const block: Block = { id: 'cal', type: 'view', mode: 'calendar', label: 'dates' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'calendar', label: 'dates', height: 110, icon: ICON.calendar },
    ])
  })

  it('reads a highlight by its own kind, not the card shape it shares with list', () => {
    const block: Block = { id: 'h', type: 'highlight', label: 'kept', content: '' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'highlight', label: 'kept', height: 44, icon: ICON.quote },
    ])
  })

  it('reads an image/file block as `file`, with no label', () => {
    const block: Block = { id: 'f', type: 'image', url: '' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'file', label: '', height: 44, icon: ICON.file },
    ])
  })

  it('reads a bare text block opening on a heading as `heading`, body lines included', () => {
    const block: Block = { id: 'h2', type: 'text', content: '# Title\nbody' }
    expect(templateOutlineRows([block])).toEqual([
      { kind: 'heading', label: '', height: 44, icon: ICON.heading },
    ])
  })

  it('previews every premade template without throwing', () => {
    for (const kind of Object.keys(PREMADE_TEMPLATES) as (keyof typeof PREMADE_TEMPLATES)[]) {
      const { blocks } = instantiateTemplate(PREMADE_TEMPLATES[kind])
      const rows = templateOutlineRows(blocks)
      expect(rows).toHaveLength(blocks.length)
      for (const row of rows) {
        expect(row.icon).toBeDefined()
      }
    }
  })
})
