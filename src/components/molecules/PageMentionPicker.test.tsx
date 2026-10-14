import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PageMentionPicker,
  type PageMentionItem,
  type MentionAnchorBox,
} from '@/components/molecules/PageMentionPicker'

const ITEMS: PageMentionItem[] = [
  { id: 'a', glyph: 'heart', label: 'kitchen renovation', sub: 'home' },
  { id: 'b', glyph: 'star-01', label: 'budget', sub: 'money' },
  { id: 'c', glyph: 'leaf', label: 'garden plan', sub: 'home' },
]

const ANCHOR: MentionAnchorBox = {
  getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 0, width: 320 }),
}

/** A controlled wrapper, like the composer host will be — `onHover` writes the state back. */
function Harness({ onPick, onClose }: { onPick: (item: PageMentionItem) => void; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  return (
    <PageMentionPicker
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
      <PageMentionPicker
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

describe('PageMentionPicker — the composer @ popover rows', () => {
  it('heads with "pages" and renders each row', () => {
    render(
      <PageMentionPicker
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

  it('highlights only the given activeIndex row', () => {
    render(
      <PageMentionPicker
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
      <PageMentionPicker
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
      <PageMentionPicker
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

  it('flips above the anchor by the same 10px gap when `side` is "top"', () => {
    render(
      <PageMentionPicker
        items={ITEMS}
        activeIndex={0}
        onHover={jest.fn()}
        onPick={jest.fn()}
        onClose={jest.fn()}
        anchor={ANCHOR}
        side="top"
      />
    )

    const popover = document.querySelector('[data-part="popover"]') as HTMLElement
    expect(popover.style.bottom).toBe(`${window.innerHeight - 100 + 10}px`)
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
