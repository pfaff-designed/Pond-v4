/**
 * KAN-475 — the favourites band's own row rendering: mark + title, in the
 * favourite ids' order, and a dead/unresolved id simply drops out rather
 * than drawing an empty-looking row.
 *
 * KAN-569 — the band's own drag-to-reorder: a 2-zone (before/after)
 * hit-test, no `'into'` zone, since the band is flat.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { RailFavouritesBand } from '@/components/organisms/RailFavouritesBand'
import type { RailNode } from '@/lib/rail/tree'
import type { MarkSource } from '@/lib/pages/mark'

// `parentId` is a nested page's real ancestor, not `null` — a top-level
// (`parentId: null`) node reads as an AREA (`resolveMark`'s `isArea` rule) and
// draws its automatic glyph, not the plain `KindDot` an ordinary favourited
// page (KAN-475's own "groceries" example, nested under "scratch") shows.
const node = (id: string, title: string): RailNode => ({
  id,
  parentId: 'scratch',
  type: 'page',
  title,
  order: 0,
  children: [],
})

const NO_MARKS: ReadonlyMap<string, MarkSource> = new Map()

describe('RailFavouritesBand', () => {
  it('renders each live favourite, mark and title, in id order', () => {
    const nodeById = new Map([
      ['groceries', node('groceries', 'groceries')],
      ['budget', node('budget', 'budget')],
      ['recipes', node('recipes', 'recipes')],
    ])
    render(
      <RailFavouritesBand ids={['groceries', 'budget', 'recipes']} nodeById={nodeById} marks={NO_MARKS} />
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['groceries', 'budget', 'recipes'])
    rows.forEach((row) => {
      expect(row.querySelector('[data-part="dot"]')).toBeInTheDocument()
    })
  })

  it('skips a dead/unresolved id without drawing an empty row', () => {
    const nodeById = new Map([
      ['groceries', node('groceries', 'groceries')],
      ['recipes', node('recipes', 'recipes')],
    ])
    render(
      <RailFavouritesBand
        ids={['groceries', 'trashed-id', 'recipes']}
        nodeById={nodeById}
        marks={NO_MARKS}
      />
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.textContent)).toEqual(['groceries', 'recipes'])
  })

  it('renders nothing when every id is dead/unresolved', () => {
    const { container } = render(
      <RailFavouritesBand ids={['gone-1', 'gone-2']} nodeById={new Map()} marks={NO_MARKS} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('a non-area favourite reads 13px/400/ink .68 at rest, 13px/500/full ink when selected', () => {
    const nodeById = new Map([['groceries', node('groceries', 'groceries')]])
    const { rerender } = render(
      <RailFavouritesBand ids={['groceries']} nodeById={nodeById} marks={NO_MARKS} />
    )
    const rest = document.querySelector('[data-kind="list-row"]') as HTMLElement
    expect(rest.className).toContain('text-[13px]')
    expect(rest.className).toContain('text-mn-text-secondary')
    expect(rest.querySelector('[data-part="title"]')?.className).not.toContain('font-medium')

    rerender(
      <RailFavouritesBand
        ids={['groceries']}
        nodeById={nodeById}
        marks={NO_MARKS}
        selectedId="groceries"
      />
    )
    const selected = document.querySelector('[data-kind="list-row"]') as HTMLElement
    // Board: `fontSize areaRow ? 13.5 : 13` — selection changes only weight
    // and ink, never size, so a selected non-area row stays 13px.
    expect(selected.className).toContain('text-[13px]')
    expect(selected.className).not.toContain('text-mn-text-secondary')
    expect(selected.querySelector('[data-part="title"]')?.className).toContain('font-medium')
  })

  it('a non-selected band row carries the full literal hover-fill class (no runtime-composed Tailwind variant)', () => {
    const nodeById = new Map([['groceries', node('groceries', 'groceries')]])
    render(<RailFavouritesBand ids={['groceries']} nodeById={nodeById} marks={NO_MARKS} />)
    const row = screen.getByRole('listitem')
    expect(row.className).toContain('hover:bg-mn-rail-hover')
  })

  it('a meta-click leaves the row unprevented (new tab); a plain click opens in-app', () => {
    const nodeById = new Map([['groceries', node('groceries', 'groceries')]])
    const onSelect = jest.fn()
    render(
      <RailFavouritesBand ids={['groceries']} nodeById={nodeById} marks={NO_MARKS} onSelect={onSelect} />
    )
    const row = screen.getByRole('listitem')
    expect(row.tagName).toBe('A')
    expect(row).toHaveAttribute('href')

    const metaClickNotCanceled = fireEvent.click(row, { metaKey: true })
    expect(metaClickNotCanceled).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()

    const plainClickCanceled = fireEvent.click(row)
    expect(plainClickCanceled).toBe(false)
    expect(onSelect).toHaveBeenCalledWith('groceries')
  })

  // jsdom has no real `DragEvent`/`DataTransfer` (testing-library falls back to
  // a plain `Event` and silently drops unknown init properties — jsdom/jsdom#1568),
  // so `clientY` and `dataTransfer` are defined directly on a plain `Event`,
  // the same workaround `rail-move-undo-path.test.tsx`'s own drag tests use.
  function dragStartEvent() {
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { effectAllowed: '', dropEffect: '', setData: jest.fn() },
    })
    return event
  }
  function dragOverEvent(clientY: number) {
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clientY', { value: clientY })
    Object.defineProperty(event, 'dataTransfer', { value: { dropEffect: '' } })
    return event
  }
  function dropEvent(clientY: number) {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clientY', { value: clientY })
    return event
  }
  /** A 20px-tall row, so `clientY: 2` lands in the top half ("before") and
   *  `clientY: 18` in the bottom half ("after") — jsdom's own
   *  `getBoundingClientRect` otherwise always returns an all-zero rect. */
  function stubRowHeight(row: HTMLElement) {
    jest.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 20,
      height: 20,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
  }

  it('dragging one row onto another calls onReorder with the resulting order', () => {
    const nodeById = new Map([
      ['groceries', node('groceries', 'groceries')],
      ['house', node('house', 'house')],
      ['roof', node('roof', 'roof')],
    ])
    const onReorder = jest.fn()
    render(
      <RailFavouritesBand
        ids={['groceries', 'house', 'roof']}
        nodeById={nodeById}
        marks={NO_MARKS}
        onReorder={onReorder}
      />
    )
    const [groceriesRow, , roofRow] = screen.getAllByRole('listitem')
    stubRowHeight(groceriesRow)

    fireEvent(roofRow, dragStartEvent())
    // Top half of the groceries row — a "before" drop.
    fireEvent(groceriesRow, dragOverEvent(2))
    fireEvent(groceriesRow, dropEvent(2))

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['roof', 'groceries', 'house'])
  })

  it('dragging a row over itself calls nothing', () => {
    const nodeById = new Map([
      ['groceries', node('groceries', 'groceries')],
      ['house', node('house', 'house')],
    ])
    const onReorder = jest.fn()
    render(
      <RailFavouritesBand
        ids={['groceries', 'house']}
        nodeById={nodeById}
        marks={NO_MARKS}
        onReorder={onReorder}
      />
    )
    const [groceriesRow] = screen.getAllByRole('listitem')
    stubRowHeight(groceriesRow)

    fireEvent(groceriesRow, dragStartEvent())
    fireEvent(groceriesRow, dragOverEvent(2))
    fireEvent(groceriesRow, dropEvent(2))

    expect(onReorder).not.toHaveBeenCalled()
  })
})
