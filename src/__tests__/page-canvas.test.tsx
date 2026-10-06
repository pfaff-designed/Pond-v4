/**
 * What is true of a page rather than of one view: the single orange `today` pill, the
 * single record peek, and the peek's surface and dismissal. A board and a list hold
 * records due on the same day and are drawn on one `PageCanvas`.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { CollectionView } from '@/lib/modules/view/view'
import { PageCanvas } from '@/lib/modules/page-canvas'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  {
    id: 's',
    name: 'status',
    type: 'status',
    options: [
      { id: 'todo', label: 'to do' },
      { id: 'done', label: 'done' },
    ],
  },
  { id: 'd', name: 'due', type: 'date' },
]

const NOW = new Date()
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}`

const dueToday = (id: string, status = 'todo'): CollectionRow => ({
  id,
  title: id,
  values: { s: status, d: TODAY },
})

const board: ViewBlock = { id: 'board', type: 'view', mode: 'board', groupBy: 's' }
const list: ViewBlock = { id: 'list', type: 'view', mode: 'list' }

const view = (config: ViewBlock, rows: CollectionRow[]) => (
  <CollectionView
    config={config}
    schema={schema}
    rows={rows}
    collectionName="tasks"
    editable
    onConfigChange={jest.fn()}
    onEdit={jest.fn()}
  />
)

const page = (boardRows: CollectionRow[], listRows: CollectionRow[]) =>
  render(
    <>
      <div data-testid="rail">rail</div>
      <PageCanvas className="canvas">
        {view(board, boardRows)}
        {view(list, listRows)}
      </PageCanvas>
    </>
  )

const pills = () => [...document.querySelectorAll('[data-part="due-today"]')]
const peeks = () => document.querySelectorAll('[data-part="record-peek"]')
const canvas = () => document.querySelector<HTMLElement>('.canvas')!
const selectOnBoard = (id: string) => fireEvent.click(screen.getByRole('article', { name: id }))
const selectOnList = (id: string) => fireEvent.click(screen.getByRole('button', { name: id }))

describe('one orange today per page', () => {
  it('goes to the first view in document order, not one per view', () => {
    page([dueToday('b1')], [dueToday('l1')])
    expect(pills()).toHaveLength(1)
    expect(document.querySelector('[data-part="lanes"]')!.contains(pills()[0])).toBe(true)
  })

  it('passes to the next view when the first has nothing open due today', () => {
    page([dueToday('b1', 'done')], [dueToday('l1')])
    expect(pills()).toHaveLength(1)
    expect(document.querySelector('[data-part="list-card"]')!.contains(pills()[0])).toBe(true)
  })

  it('is never worn by a finished record', () => {
    page([dueToday('b1', 'done')], [dueToday('l1', 'done')])
    expect(pills()).toHaveLength(0)
  })

  it('a view drawn outside a canvas keeps its own', () => {
    render(view(list, [dueToday('l1')]))
    expect(pills()).toHaveLength(1)
  })
})

describe('one record peek per page', () => {
  it('selecting in the list swaps out the board’s peek', () => {
    page([dueToday('b1')], [dueToday('l1')])
    selectOnBoard('b1')
    expect(peeks()).toHaveLength(1)
    selectOnList('l1')
    expect(peeks()).toHaveLength(1)
    expect(peeks()[0]).toHaveTextContent('l1')
  })

  it('draws against the canvas, absolutely, so no block can clip it', () => {
    page([dueToday('b1')], [dueToday('l1')])
    selectOnBoard('b1')
    const peek = peeks()[0] as HTMLElement
    expect(canvas().contains(peek)).toBe(true)
    expect(peek.parentElement).toBe(canvas())
    expect(peek.className).toContain('absolute')
    expect(peek.className).not.toContain('fixed')
    expect(peek.className).toContain('right-[44px]')
    expect(peek.className).toContain('top-[150px]')
  })
})

describe('dismissing the peek', () => {
  it('a press on the canvas’s own paper closes it', () => {
    page([dueToday('b1')], [dueToday('l1')])
    selectOnBoard('b1')
    fireEvent.pointerDown(canvas())
    expect(peeks()).toHaveLength(0)
  })

  it('a press on the rail or the composer — outside the canvas — does not', () => {
    page([dueToday('b1')], [dueToday('l1')])
    selectOnBoard('b1')
    fireEvent.pointerDown(screen.getByTestId('rail'))
    expect(peeks()).toHaveLength(1)
  })

  it('Esc closes it', () => {
    page([dueToday('b1')], [dueToday('l1')])
    selectOnBoard('b1')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(peeks()).toHaveLength(0)
  })

  it('Esc already taken by an open menu or picker does not also close it', () => {
    page([dueToday('b1')], [dueToday('l1')])
    selectOnBoard('b1')
    const handled = (e: KeyboardEvent) => e.preventDefault()
    document.addEventListener('keydown', handled, { capture: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    document.removeEventListener('keydown', handled, { capture: true })
    expect(peeks()).toHaveLength(1)
  })
})
