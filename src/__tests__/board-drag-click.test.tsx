/**
 * A drag that ends over its own card makes the browser click that card. The click is
 * the drag's, not a selection — but only that one: the next gesture selects as normal.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { CollectionView } from '@/lib/modules/view/view'
import type { ViewBlock } from '@/lib/modules/view/schema'
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
]
const config: ViewBlock = { id: 'b', type: 'view', mode: 'board', groupBy: 's' }

const renderBoard = () =>
  render(
    <CollectionView
      config={config}
      schema={schema}
      rows={[{ id: 'a', title: 'Card', values: { s: 'todo' } }]}
      collectionName="tasks"
      editable
      onConfigChange={jest.fn()}
      onEdit={jest.fn()}
    />
  )

const card = () => screen.getByRole('article', { name: 'Card' })
const peek = () => document.querySelector('[data-part="record-peek"]')
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('board — a drag is not a click', () => {
  it('the click after a drag ends does not select; the next click does', async () => {
    renderBoard()
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card(), { clientX: 60, clientY: 10 })
    fireEvent.pointerUp(card())
    fireEvent.click(card())
    expect(peek()).toBeNull()

    await nextTurn()
    fireEvent.click(card())
    expect(peek()).not.toBeNull()
  })

  it('a cancelled drag ends the same way and leaves nothing stuck', async () => {
    renderBoard()
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card(), { clientX: 60, clientY: 10 })
    fireEvent.pointerCancel(card())
    await nextTurn()
    fireEvent.click(card())
    expect(peek()).not.toBeNull()
  })

  it('a press that never travels is a click and selects', () => {
    renderBoard()
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(card())
    fireEvent.click(card())
    expect(peek()).not.toBeNull()
  })
})
