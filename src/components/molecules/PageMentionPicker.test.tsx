import { useState } from 'react'
import { render, screen } from '@testing-library/react'
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
})
