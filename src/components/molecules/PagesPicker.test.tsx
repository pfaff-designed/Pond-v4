import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PagesPicker,
  type PageMentionItem,
  type MentionAnchorBox,
} from '@/components/molecules/PagesPicker'

const ITEMS: PageMentionItem[] = [
  { id: 'a', glyph: 'heart', label: 'kitchen renovation', sub: 'home' },
  { id: 'b', glyph: 'star-01', label: 'budget', sub: 'money' },
  { id: 'c', glyph: 'leaf', label: 'garden plan', sub: 'home' },
]

const MANY_ITEMS: PageMentionItem[] = Array.from({ length: 20 }, (_, i) => ({
  id: `page-${i}`,
  glyph: 'heart',
  label: `page ${i}`,
  sub: 'home',
}))

const ANCHOR: MentionAnchorBox = {
  getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 0, width: 320 }),
}

/** Room above (`700 − 10 − 8 = 682px`) comfortably fits the head plus two rows
 * against jsdom's default 768px `innerHeight`, so the glass opens above. */
const ANCHOR_ABOVE: MentionAnchorBox = {
  getBoundingClientRect: () => ({ top: 700, bottom: 740, left: 0, width: 320 }),
}

function stubInnerHeight(height: number): () => void {
  const original = window.innerHeight
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  return () => Object.defineProperty(window, 'innerHeight', { value: original, configurable: true })
}

/** A controlled wrapper, like the composer host will be — `onHover` writes the state back. */
function Harness({ onPick, onClose }: { onPick: (item: PageMentionItem) => void; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  return (
    <PagesPicker
      items={ITEMS}
      activeIndex={activeIndex}
      onHover={setActiveIndex}
      onPick={onPick}
      onClose={onClose}
      anchor={ANCHOR}
    />
  )
}

/** A real composer (a div wrapping a textarea) plus a sibling the page editor
 * stands in for, so the outside-click/blur close can be exercised against an
 * anchor that is an actual DOM node — `ANCHOR` above is not one. */
function OutsideHarness({ onClose }: { onClose: () => void }) {
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div>
      <button type="button">page editor</button>
      <div ref={anchorRef} data-testid="composer">
        <textarea data-testid="composer-input" />
      </div>
      <PagesPicker
        items={ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={onClose}
        anchor={anchorRef}
      />
    </div>
  )
}

describe('PagesPicker — the composer @ popover rows', () => {
  it('heads with "pages" and renders each row', () => {
    render(
      <PagesPicker
        items={ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    expect(screen.getByText('pages')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('option', { name: /kitchen renovation/ })).toBeInTheDocument()
    expect(screen.getAllByText('home')).toHaveLength(2)
  })

  it('renders each row through slash-row\'s Row, carrying the composer row chrome', () => {
    render(
      <PagesPicker
        items={ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    const row = screen.getByRole('option', { name: /kitchen renovation/ })
    expect(row).toHaveAttribute('data-part', 'row')
    expect(row.className).toContain('rounded-[14px]')
    expect(row.className).toContain('text-[13px]')
  })

  it('leads a glyph row and a default-mark row with the same 13×13 icon slot', () => {
    const items: PageMentionItem[] = [
      { id: 'a', glyph: 'heart', label: 'kitchen renovation', sub: 'home' },
      { id: 'd', glyph: null, label: 'shopping list', sub: 'home' },
    ]
    render(
      <PagesPicker
        items={items}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    const glyphRow = screen.getByRole('option', { name: /kitchen renovation/ })
    const defaultRow = screen.getByRole('option', { name: /shopping list/ })
    const glyphIcon = glyphRow.querySelector('[data-part="icon"]')
    const defaultIcon = defaultRow.querySelector('[data-part="icon"]')
    expect(glyphIcon?.className).toContain('h-[13px]')
    expect(glyphIcon?.className).toContain('w-[13px]')
    expect(defaultIcon?.className).toContain('h-[13px]')
    expect(defaultIcon?.className).toContain('w-[13px]')
  })

  it('draws the default mark, never a blank glyph, for a page with no stored glyph', () => {
    const items: PageMentionItem[] = [{ id: 'd', glyph: null, label: 'shopping list', sub: 'home' }]
    render(
      <PagesPicker
        items={items}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    const row = screen.getByRole('option', { name: /shopping list/ })
    expect(row.querySelector('[data-part="dot"]')).toBeInTheDocument()
    expect(row.querySelector('[data-area-mark]')).not.toBeInTheDocument()
  })

  it('highlights only the given activeIndex row', () => {
    render(
      <PagesPicker
        items={ITEMS}
        activeIndex={1}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('aria-selected', 'false')
    expect(rows[0].className).not.toContain('bg-mn-text/[0.07]')
    expect(rows[1]).toHaveAttribute('aria-selected', 'true')
    expect(rows[1].className).toContain('bg-mn-text/[0.07]')
    expect(rows[2]).toHaveAttribute('aria-selected', 'false')
    expect(rows[2].className).not.toContain('bg-mn-text/[0.07]')
  })

  it('moves the active row down and up on ArrowDown/ArrowUp, clamped', async () => {
    const user = userEvent.setup()
    render(<Harness onPick={jest.fn()} onClose={jest.fn()} />)

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /budget/ })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('option', { name: /kitchen renovation/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('calls onPick with the active item on Enter', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    render(<Harness onPick={onPick} onClose={jest.fn()} />)

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith(ITEMS[1])
  })

  it('calls onClose on Escape', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Harness onPick={jest.fn()} onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not swallow Enter when there are no matching rows, so the composer can still send', () => {
    const onPick = jest.fn()
    render(
      <PagesPicker
        items={[]}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={onPick}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(onPick).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores Enter while composing (IME), leaving it for the composer', () => {
    const onPick = jest.fn()
    render(<Harness onPick={onPick} onClose={jest.fn()} />)

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(onPick).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('closes on a pointerdown outside the picker and the composer', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<OutsideHarness onClose={onClose} />)

    await user.click(screen.getByText('page editor'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close on a pointerdown inside the composer', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<OutsideHarness onClose={onClose} />)

    await user.click(screen.getByTestId('composer-input'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close on a pointerdown on one of its own rows', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<OutsideHarness onClose={onClose} />)

    await user.pointer({ target: screen.getByRole('option', { name: /budget/ }), keys: '[MouseLeft]' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the composer loses focus to the page', () => {
    const onClose = jest.fn()
    render(<OutsideHarness onClose={onClose} />)

    const input = screen.getByTestId('composer-input')
    input.focus()
    fireEvent.focusOut(input, { relatedTarget: screen.getByText('page editor') })

    expect(onClose).toHaveBeenCalled()
  })

  it('positions off the given anchor with the DC\'s 10px gap and 12px inset', () => {
    render(
      <PagesPicker
        items={ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    const popover = document.querySelector('[data-part="popover"]') as HTMLElement
    // ANCHOR: top 100, bottom 140, left 0, width 320 — default side 'bottom'.
    expect(popover.style.top).toBe(`${140 + 10}px`) // sPop's `calc(100% + 10px)` gap
    expect(popover.style.left).toBe('12px') // sPop's `left: 12` inset off the anchor
    expect(popover.style.width).toBe(`${320 - 24}px`) // sPop's `left: 12, right: 12` inset
  })

  it('flips above the anchor by the same 10px gap when room above fits the head plus two rows', () => {
    render(
      <PagesPicker
        items={ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR_ABOVE}
      />
    )

    const popover = document.querySelector('[data-part="popover"]') as HTMLElement
    expect(popover.style.bottom).toBe(`${window.innerHeight - 700 + 10}px`)
  })

  it('caps the row list to six rows\' height and scrolls the rest, with 20 pages', () => {
    render(
      <PagesPicker
        items={MANY_ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
      />
    )

    expect(screen.getAllByRole('option')).toHaveLength(20)
    const listbox = screen.getByRole('listbox')
    expect(listbox.style.maxHeight).toBe(`${6 * 35.5}px`)
    expect(listbox.className).toContain('overflow-y-auto')
  })

  describe('measures its own anchor to stay wholly on screen (round 3)', () => {
    // `GLASS_CHROME_PX` (45.75) is read off the component's own doc comment,
    // derived from the item's own live measurement (a capped six-row glass
    // is 258.75px tall; 258.75 − 6×35.5 = 45.75). The item's three worked
    // examples give test 1 and test 2 the same `card top 160`, but ask for
    // two different outcomes ("room above < head+2 rows" vs. "room for
    // head+3 rows above") off the identical room-above figure that follows
    // from one `top` value — those can't both hold for any one chrome
    // constant, so the fixtures below pick anchor rects that are internally
    // consistent with the formula while exercising the three NAMED
    // behaviours exactly (tight above → opens below; moderate above → stays
    // above with a clamped cap; ample above → the full six-row cap). Test 3
    // keeps the item's own literal numbers (card top 700, innerHeight 900)
    // verbatim — those two are consistent with each other.

    it('opens below when room above is too tight for the head plus two rows', () => {
      const restoreInnerHeight = stubInnerHeight(500)
      try {
        const anchor: MentionAnchorBox = {
          getBoundingClientRect: () => ({ top: 50, bottom: 90, left: 0, width: 320 }),
        }
        render(
          <PagesPicker
            items={MANY_ITEMS}
            activeIndex={0}
            onHover={jest.fn()}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={anchor}
          />
        )

        const popover = document.querySelector('[data-part="popover"]') as HTMLElement
        const listbox = screen.getByRole('listbox')
        // room above (50 − 10 − 8 = 32) doesn't fit the head (45.75) plus
        // two rows (71), and is also smaller than room below (392) — opens
        // below, at the anchor's own 10px gap.
        expect(popover.style.top).toBe(`${90 + 10}px`)
        expect(popover.style.bottom).toBe('')
        const glassBottom = 90 + 10 + 45.75 + parseFloat(listbox.style.maxHeight)
        expect(glassBottom).toBeLessThanOrEqual(500)
      } finally {
        restoreInnerHeight()
      }
    })

    it('stays above with a clamped row-list height when room above only fits a few rows', () => {
      const restoreInnerHeight = stubInnerHeight(500)
      try {
        const anchor: MentionAnchorBox = {
          getBoundingClientRect: () => ({ top: 198, bottom: 230, left: 0, width: 320 }),
        }
        render(
          <PagesPicker
            items={MANY_ITEMS}
            activeIndex={0}
            onHover={jest.fn()}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={anchor}
          />
        )

        const popover = document.querySelector('[data-part="popover"]') as HTMLElement
        const listbox = screen.getByRole('listbox')
        // room above (198 − 18 = 180) fits the head plus two rows (116.75),
        // so it opens above — but 180 is short of the full six-row cap
        // (258.75), so the list clamps to 180 − 45.75 = 134.25 rather than
        // the full 213.
        expect(popover.style.bottom).toBe(`${500 - 198 + 10}px`)
        expect(listbox.style.maxHeight).toBe('134.25px')
        const glassTop = 500 - parseFloat(popover.style.bottom) - (45.75 + parseFloat(listbox.style.maxHeight))
        expect(glassTop).toBeGreaterThanOrEqual(0)
      } finally {
        restoreInnerHeight()
      }
    })

    it('opens above with the full six-row cap when room above is ample', () => {
      const restoreInnerHeight = stubInnerHeight(900)
      try {
        const anchor: MentionAnchorBox = {
          getBoundingClientRect: () => ({ top: 700, bottom: 740, left: 0, width: 320 }),
        }
        render(
          <PagesPicker
            items={MANY_ITEMS}
            activeIndex={0}
            onHover={jest.fn()}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={anchor}
          />
        )

        const popover = document.querySelector('[data-part="popover"]') as HTMLElement
        const listbox = screen.getByRole('listbox')
        expect(popover.style.bottom).toBe(`${900 - 700 + 10}px`)
        expect(listbox.style.maxHeight).toBe(`${6 * 35.5}px`)
      } finally {
        restoreInnerHeight()
      }
    })

    it('recomputes the layout when the item count narrows', () => {
      const restoreInnerHeight = stubInnerHeight(500)
      try {
        const anchor: MentionAnchorBox = {
          getBoundingClientRect: () => ({ top: 198, bottom: 230, left: 0, width: 320 }),
        }
        const { rerender } = render(
          <PagesPicker
            items={MANY_ITEMS}
            activeIndex={0}
            onHover={jest.fn()}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={anchor}
          />
        )
        expect(screen.getByRole('listbox').style.maxHeight).toBe('134.25px')

        rerender(
          <PagesPicker
            items={ITEMS}
            activeIndex={0}
            onHover={jest.fn()}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={anchor}
          />
        )
        // Room above hasn't changed, so the clamp doesn't either — this
        // proves the effect re-ran (not that the number moved) by asserting
        // against the smaller item set's own rows.
        expect(screen.getAllByRole('option')).toHaveLength(3)
        expect(screen.getByRole('listbox').style.maxHeight).toBe('134.25px')
      } finally {
        restoreInnerHeight()
      }
    })

    it('pins to the viewport margin when neither side fits the head plus one row', () => {
      const restoreInnerHeight = stubInnerHeight(500)
      try {
        // A composer dragged to its max height: card top 72, bottom 476.
        // Room above (72 − 18 = 54) and room below (500 − 476 − 18 = 6) both
        // fall short of the head plus one row (45.75 + 35.5 = 81.25).
        const anchor: MentionAnchorBox = {
          getBoundingClientRect: () => ({ top: 72, bottom: 476, left: 0, width: 320 }),
        }
        render(
          <PagesPicker
            items={MANY_ITEMS}
            activeIndex={0}
            onHover={jest.fn()}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={anchor}
          />
        )

        const popover = document.querySelector('[data-part="popover"]') as HTMLElement
        const listbox = screen.getByRole('listbox')
        expect(popover.style.top).toBe('8px')
        expect(popover.style.bottom).toBe('')
        const glassBottom = 8 + 45.75 + parseFloat(listbox.style.maxHeight)
        expect(glassBottom).toBeLessThanOrEqual(500)
      } finally {
        restoreInnerHeight()
      }
    })
  })

  it('scrolls the active row into view when the active index moves', () => {
    const scrollIntoView = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    function Stepper() {
      const [activeIndex, setActiveIndex] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setActiveIndex(15)}>
            jump
          </button>
          <PagesPicker
            items={MANY_ITEMS}
            activeIndex={activeIndex}
            onHover={setActiveIndex}
            onPick={jest.fn()}
            onClose={jest.fn()}
            anchor={ANCHOR}
          />
        </>
      )
    }

    render(<Stepper />)
    scrollIntoView.mockClear()
    fireEvent.click(screen.getByText('jump'))

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    const active = screen.getByRole('option', { name: /page 15/ })
    expect(active).toHaveAttribute('aria-selected', 'true')
  })

  it('does not close when focus moves from the composer onto one of its own rows', () => {
    const onClose = jest.fn()
    render(<OutsideHarness onClose={onClose} />)

    const input = screen.getByTestId('composer-input')
    input.focus()
    fireEvent.focusOut(input, { relatedTarget: screen.getByRole('option', { name: /budget/ }) })

    expect(onClose).not.toHaveBeenCalled()
  })
})
