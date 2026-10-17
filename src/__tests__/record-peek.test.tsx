/**
 * The board's card selection and record peek (`Pond 06.21` 6u.2 / `Pond 02` 2u).
 *
 * A click, Enter or Space selects a card and opens its record beside the view;
 * another card swaps it; Esc or empty paper closes it. Burnt orange stays the ONE
 * dated thing on the board: only the first `today` in render order wears it.
 */

import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CollectionView } from '@/lib/modules/view/view'
import { PageCanvas } from '@/lib/modules/page-canvas'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  {
    id: 'p-status',
    name: 'status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'to do' },
      { id: 'o-done', label: 'done' },
    ],
  },
  { id: 'p-due', name: 'due', type: 'date' },
  { id: 'p-notes', name: 'notes', type: 'text' },
]

const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const rows: CollectionRow[] = [
  { id: 'row-1', title: 'Trim the rim', values: { 'p-status': 'o-todo', 'p-notes': 'foot ring' } },
  { id: 'row-2', title: 'Wedge stoneware', values: { 'p-status': 'o-todo' } },
  { id: 'row-3', title: 'Pack the kiln', values: { 'p-status': 'o-done' } },
]

const config: ViewBlock = { id: 'v1', type: 'view', mode: 'board', groupBy: 'p-status' }

function renderBoard(overrides: Partial<React.ComponentProps<typeof CollectionView>> = {}) {
  return render(<CollectionView config={config} schema={schema} rows={rows} {...overrides} />)
}

const card = (title: string) => screen.getByRole('article', { name: title })
const peek = () => document.querySelector<HTMLElement>('[data-part="record-peek"]')

describe('record peek — selection', () => {
  it('draws no peek until a card is chosen', () => {
    renderBoard()
    expect(peek()).toBeNull()
  })

  it('a click selects the card and opens its record', () => {
    renderBoard()
    fireEvent.click(card('Trim the rim'))
    expect(card('Trim the rim')).toHaveAttribute('aria-current', 'true')
    expect(within(peek()!).getByText('Trim the rim')).toBeInTheDocument()
    expect(within(peek()!).getByText('foot ring')).toBeInTheDocument()
  })

  it('another card swaps the record rather than stacking a second', () => {
    renderBoard()
    fireEvent.click(card('Trim the rim'))
    fireEvent.click(card('Wedge stoneware'))
    expect(document.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)
    expect(within(peek()!).getByText('Wedge stoneware')).toBeInTheDocument()
    expect(card('Trim the rim')).not.toHaveAttribute('aria-current')
  })

  it('Esc closes the peek', () => {
    renderBoard()
    fireEvent.click(card('Trim the rim'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(peek()).toBeNull()
  })

  it('a press on empty paper closes it; a press on a card or inside the peek does not', () => {
    renderBoard()
    fireEvent.click(card('Trim the rim'))
    fireEvent.pointerDown(peek()!)
    fireEvent.pointerDown(card('Wedge stoneware'))
    expect(peek()).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(peek()).toBeNull()
  })

  it('draws no modal, scrim or dialog — the lanes stay live', () => {
    renderBoard()
    fireEvent.click(card('Trim the rim'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('draws only the fields the schema has, one row each', () => {
    renderBoard()
    fireEvent.click(card('Wedge stoneware'))
    const labels = [...peek()!.querySelectorAll('[data-part="peek-field"]')].map(
      (f) => f.firstElementChild!.textContent
    )
    expect(labels).toEqual(['status', 'due', 'notes'])
  })

  it('an empty read-only field is a dash', () => {
    renderBoard()
    fireEvent.click(card('Wedge stoneware'))
    const notes = [...peek()!.querySelectorAll('[data-part="peek-field"]')].find(
      (f) => f.firstElementChild!.textContent === 'notes'
    )!
    expect(notes.lastElementChild).toHaveTextContent('—')
  })

  it('the peek of a card that disappears closes with it', () => {
    const { rerender } = renderBoard()
    fireEvent.click(card('Trim the rim'))
    rerender(<CollectionView config={config} schema={schema} rows={rows.slice(1)} />)
    expect(peek()).toBeNull()
  })
})

describe('record peek — keyboard', () => {
  it('a card is a tab stop', () => {
    renderBoard()
    expect(card('Trim the rim')).toHaveAttribute('tabindex', '0')
    expect(card('Trim the rim')).toHaveAccessibleName('Trim the rim')
  })

  it.each([['{Enter}'], [' ']])(
    '%j on the card selects it and moves focus into the peek',
    async (key) => {
      const user = userEvent.setup()
      renderBoard()
      card('Trim the rim').focus()
      await user.keyboard(key)
      expect(card('Trim the rim')).toHaveAttribute('aria-current', 'true')
      expect(peek()!.contains(document.activeElement)).toBe(true)
    }
  )

  it('Esc returns focus to the card', async () => {
    const user = userEvent.setup()
    renderBoard()
    card('Trim the rim').focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')
    expect(peek()).toBeNull()
    expect(document.activeElement).toBe(card('Trim the rim'))
  })

  it('typing a space in the title input does not select the card', async () => {
    const user = userEvent.setup()
    renderBoard({ editable: true, onRenameRow: jest.fn() })
    screen.getAllByLabelText('Card title')[0].focus()
    await user.keyboard(' ')
    expect(peek()).toBeNull()
  })
})

describe('record peek — editing and navigation', () => {
  it('clicking the title input of an editable card selects it', () => {
    renderBoard({ editable: true, onRenameRow: jest.fn() })
    fireEvent.click(screen.getAllByLabelText('Card title')[0])
    expect(peek()).not.toBeNull()
  })

  it('a field edit goes through onEdit with the row, field and value, once on blur', () => {
    const onEdit = jest.fn()
    renderBoard({ editable: true, onEdit, onRenameRow: jest.fn() })
    fireEvent.click(card('Wedge stoneware'))
    const notes = within(peek()!).getByLabelText('notes value')
    fireEvent.change(notes, { target: { value: 'wet' } })
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.blur(notes)
    expect(onEdit).toHaveBeenCalledWith('row-2', 'p-notes', 'wet')
  })

  it('typing a title in the peek key by key commits once on blur, not per keystroke', async () => {
    const user = userEvent.setup()
    const onRenameRow = jest.fn()
    renderBoard({ editable: true, onRenameRow })
    fireEvent.click(card('Wedge stoneware'))
    const title = within(peek()!).getByLabelText('Record title')
    await user.clear(title)
    await user.type(title, 'Wedge clay')
    expect(onRenameRow).not.toHaveBeenCalled()
    fireEvent.blur(title)
    expect(onRenameRow).toHaveBeenCalledTimes(1)
    expect(onRenameRow).toHaveBeenCalledWith('row-2', 'Wedge clay')
  })

  it('a read-only board draws the record without inputs', () => {
    renderBoard()
    fireEvent.click(card('Wedge stoneware'))
    expect(peek()!.querySelector('input, select, textarea')).toBeNull()
  })

  it('`open ›` navigates to the row; it is absent without a host', () => {
    const onOpenRow = jest.fn()
    const { unmount } = renderBoard({ onOpenRow })
    fireEvent.click(card('Pack the kiln'))
    fireEvent.click(screen.getByRole('button', { name: 'open ›' }))
    expect(onOpenRow).toHaveBeenCalledWith('row-3')
    unmount()

    renderBoard()
    fireEvent.click(card('Pack the kiln'))
    expect(screen.queryByRole('button', { name: 'open ›' })).not.toBeInTheDocument()
  })
})

describe('record peek — position on a scrolled canvas', () => {
  const canvasEl = () => document.querySelector<HTMLElement>('.canvas')!

  it('measures top from the canvas’s visible top, not the scrolled content’s', () => {
    render(
      <PageCanvas className="canvas">
        <CollectionView config={config} schema={schema} rows={rows} />
      </PageCanvas>
    )
    canvasEl().scrollTop = 800
    fireEvent.click(card('Trim the rim'))
    expect(peek()).toHaveStyle({ top: '950px' })
  })

  it('a canvas scrolled to the top keeps 150', () => {
    render(
      <PageCanvas className="canvas">
        <CollectionView config={config} schema={schema} rows={rows} />
      </PageCanvas>
    )
    canvasEl().scrollTop = 0
    fireEvent.click(card('Trim the rim'))
    expect(peek()).toHaveStyle({ top: '150px' })
  })

  it('off a canvas, top stays 150', () => {
    renderBoard()
    fireEvent.click(card('Trim the rim'))
    expect(peek()).toHaveStyle({ top: '150px' })
  })
})

describe('the board — one orange `today`', () => {
  const dated: CollectionRow[] = [
    { id: 'a', title: 'Late job', values: { 'p-status': 'o-done', 'p-due': today } },
    { id: 'b', title: 'First job', values: { 'p-status': 'o-todo', 'p-due': today } },
    { id: 'c', title: 'Second job', values: { 'p-status': 'o-todo', 'p-due': today } },
  ]

  it('only the first card due today, in lane then card order, wears the pill', () => {
    renderBoard({ rows: dated })
    expect(document.querySelectorAll('[data-part="due-today"]')).toHaveLength(1)
    expect(card('First job').querySelector('[data-part="due-today"]')).not.toBeNull()
  })

  it('the others read `today` as a plain date', () => {
    renderBoard({ rows: dated })
    for (const title of ['Second job', 'Late job']) {
      expect(card(title).querySelector('[data-part="due-today"]')).toBeNull()
      expect(card(title).querySelector('[data-part="card-due"]')).toHaveTextContent('today')
    }
  })
})
