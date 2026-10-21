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

  it('the board carries select-none only while a drag is active, so native text selection never races the drag', () => {
    const { container } = renderBoard()
    const board = container.querySelector('[data-part="lanes"]')!.parentElement! as HTMLElement

    expect(board.className).not.toMatch(/select-none/)
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })
    expect(board.className).not.toMatch(/select-none/) // below the drag threshold: still a candidate click
    fireEvent.pointerMove(card(), { clientX: 60, clientY: 10 })
    expect(board.className).toMatch(/select-none/)
    fireEvent.pointerUp(card())
    expect(board.className).not.toMatch(/select-none/)
  })

  it('a press that never travels is a click and selects', () => {
    renderBoard()
    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(card())
    fireEvent.click(card())
    expect(peek()).not.toBeNull()
  })

  it('the pointer leaving the board (off an edge, no further pointermove) cancels: writes nothing', () => {
    const onEdit = jest.fn()
    const { container } = render(
      <CollectionView
        config={config}
        schema={schema}
        rows={[{ id: 'a', title: 'Card', values: { s: 'todo' } }]}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={onEdit}
      />
    )
    // Give the "done" lane a real rect so the pointer is genuinely over a drop
    // target when it leaves — proving the leave cancels rather than merely
    // never finding a bucket (which old or new code would both no-op on).
    const doneLane = container.querySelector('[data-lane="done"]') as HTMLElement
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const rect = this === doneLane ? [200, 0, 300, 100] : [0, 0, 0, 0]
      const [left, top, right, bottom] = rect
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this
        },
      } as DOMRect
    })
    const boardContainer = doneLane.closest('[data-part="lanes"]')!.parentElement!

    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card(), { clientX: 250, clientY: 50 })
    fireEvent.pointerLeave(boardContainer)

    expect(onEdit).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  it('a press on a card collapses an existing page selection even when the press never becomes a drag', () => {
    renderBoard()
    // jsdom's own `.focus()` happens to collapse the selection as a side effect of
    // *changing* focus — but only on an element that wasn't already focused. Pre-focus
    // the card so the hook's own `.focus()` call is a same-element no-op, isolating the
    // guard's own `removeAllRanges()` as the only thing that can still collapse it.
    card().focus()
    const range = document.createRange()
    range.selectNodeContents(card())
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    expect(sel?.isCollapsed).toBe(false)

    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })

    expect(window.getSelection()?.isCollapsed).toBe(true)
  })

  it('a card press focuses without scrolling, so a partly clipped card does not move under the pointer', () => {
    renderBoard()
    const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus')

    fireEvent.pointerDown(card(), { clientX: 10, clientY: 10 })

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    focusSpy.mockRestore()
  })
})
