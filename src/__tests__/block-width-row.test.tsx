/**
 * `BlockWidthRow`, the block menu's `width` group content (6x): six cells in
 * order, the current width filled ink, `full` filled at rest when the block
 * has none.
 */

import React, { useRef, useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondMenu, type PondMenuGroup } from '@/components/molecules/PondMenu'
import { BlockWidthRow } from '@/components/molecules/BlockWidthRow'
import type { BlockWidth } from '@/lib/modules/content'

// This harness's groups hold only `content` (the width row) plus, when
// `withExtraItem` asks for one, a single item in a group below it — a place
// for focus to land when it leaves the row via Base UI's own ↓.
type ExtraAction = 'extra'

const Harness = ({
  width,
  onSelect,
  onPreview,
  size,
  withExtraItem,
}: {
  width: BlockWidth | undefined
  onSelect?: (width: BlockWidth) => void
  onPreview?: (width: BlockWidth | null) => void
  size?: 'desktop' | 'mobile'
  withExtraItem?: boolean
}) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const groups: PondMenuGroup<ExtraAction>[] = [
    {
      id: 'width',
      label: 'width',
      heading: true,
      content: <BlockWidthRow width={width} onSelect={onSelect ?? (() => {})} onPreview={onPreview} size={size} />,
    },
    ...(withExtraItem
      ? [
          {
            id: 'extra',
            label: 'extra',
            items: [{ id: 'extra-item', label: 'extra item', action: 'extra' as const }],
          },
        ]
      : []),
  ]
  return (
    <div ref={anchorRef}>
      <PondMenu
        kind="block"
        label="block menu"
        groups={groups}
        open={open}
        onOpenChange={setOpen}
        onSelect={() => {}}
        trigger={<button type="button">handle</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
      />
    </div>
  )
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'handle' }))
  return screen.findByRole('menu', { name: 'block menu' })
}

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(' ')

describe('BlockWidthRow', () => {
  it('draws the six cells in order: ¼ ⅓ ½ ⅔ ¾ full', async () => {
    const user = userEvent.setup()
    render(<Harness width={undefined} />)
    const menu = await openMenu(user)
    expect(within(menu).getAllByRole('menuitem').map((cell) => cell.textContent)).toEqual([
      '¼',
      '⅓',
      '½',
      '⅔',
      '¾',
      'full',
    ])
  })

  it('fills the current width ink, paper text', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" />)
    const menu = await openMenu(user)
    const half = within(menu).getByRole('menuitem', { name: '½' })
    for (const cls of ['bg-mn-text', 'text-raw-paper', 'dark:text-raw-ink']) {
      expect(classesOf(half)).toContain(cls)
    }
    expect(classesOf(half)).not.toContain('text-mn-text')
    const quarter = within(menu).getByRole('menuitem', { name: '¼' })
    expect(classesOf(quarter)).not.toContain('bg-mn-text')
    expect(classesOf(quarter)).toContain('text-mn-text')
  })

  it('fills `full` at rest when the block has no width', async () => {
    const user = userEvent.setup()
    render(<Harness width={undefined} />)
    const menu = await openMenu(user)
    const full = within(menu).getByRole('menuitem', { name: 'full' })
    for (const cls of ['bg-mn-text', 'text-raw-paper', 'dark:text-raw-ink']) {
      expect(classesOf(full)).toContain(cls)
    }
  })

  it('previews a non-kept cell on hover and calls onPreview', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    await user.hover(twoThirds)
    expect(classesOf(twoThirds)).toContain('bg-mn-hover-fill')
    expect(classesOf(twoThirds)).toContain('[box-shadow:inset_0_0_0_1px_var(--mn-rail-field-ring)]')
    expect(onPreview).toHaveBeenCalledWith('2/3')
  })

  it('clears the preview on leaving the row', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    await user.hover(twoThirds)
    await user.unhover(twoThirds)
    expect(classesOf(twoThirds)).not.toContain('bg-mn-hover-fill')
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })

  it('is a no-op hovering the already-kept cell', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const half = within(menu).getByRole('menuitem', { name: '½' })
    await user.hover(half)
    expect(classesOf(half)).not.toContain('bg-mn-hover-fill')
    expect(onPreview).toHaveBeenCalledWith(null)
  })

  it('shows the note while previewing a different width', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" />)
    const menu = await openMenu(user)
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    await user.hover(twoThirds)
    expect(within(menu).getByText('showing ⅔ on the page · click to keep, esc to go back')).toBeInTheDocument()
  })

  it('shows the note for full', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" />)
    const menu = await openMenu(user)
    const full = within(menu).getByRole('menuitem', { name: 'full' })
    await user.hover(full)
    expect(within(menu).getByText('showing full on the page · click to keep, esc to go back')).toBeInTheDocument()
  })

  it('has no note at rest or hovering the kept cell', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" />)
    const menu = await openMenu(user)
    expect(within(menu).queryByText(/showing/)).not.toBeInTheDocument()
    const half = within(menu).getByRole('menuitem', { name: '½' })
    await user.hover(half)
    expect(within(menu).queryByText(/showing/)).not.toBeInTheDocument()
  })

  it('clears the note on leaving the row', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" />)
    const menu = await openMenu(user)
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    await user.hover(twoThirds)
    await user.unhover(twoThirds)
    expect(within(menu).queryByText(/showing/)).not.toBeInTheDocument()
  })

  it('→ moves focus to the next cell and previews it, same as hover', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const half = within(menu).getByRole('menuitem', { name: '½' })
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    act(() => half.focus())
    await user.keyboard('{ArrowRight}')
    expect(twoThirds).toHaveFocus()
    expect(classesOf(twoThirds)).toContain('bg-mn-hover-fill')
    expect(onPreview).toHaveBeenLastCalledWith('2/3')
    expect(within(menu).getByText('showing ⅔ on the page · click to keep, esc to go back')).toBeInTheDocument()
  })

  it('← moves focus to the previous cell, back to the kept cell is a no-op preview', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const half = within(menu).getByRole('menuitem', { name: '½' })
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    act(() => twoThirds.focus())
    await user.keyboard('{ArrowLeft}')
    expect(half).toHaveFocus()
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(within(menu).queryByText(/showing/)).not.toBeInTheDocument()
  })

  it('← does not move past the first cell, no wrap', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const quarter = within(menu).getByRole('menuitem', { name: '¼' })
    // Focusing it already previews it (onFocus) — the assertion below is about
    // the blocked ← doing nothing further, not about onPreview never firing.
    act(() => quarter.focus())
    expect(onPreview).toHaveBeenLastCalledWith('1/4')
    onPreview.mockClear()
    await user.keyboard('{ArrowLeft}')
    expect(quarter).toHaveFocus()
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('→ does not move past the last cell, no wrap', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)
    const full = within(menu).getByRole('menuitem', { name: 'full' })
    act(() => full.focus())
    expect(onPreview).toHaveBeenLastCalledWith('full')
    onPreview.mockClear()
    await user.keyboard('{ArrowRight}')
    expect(full).toHaveFocus()
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('↓ into the row previews the focused cell, not just ← → within it', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} />)
    const menu = await openMenu(user)

    // Opening with a click never focuses a cell, so send focus to the row the
    // way Base UI itself would: a bare DOM focus, not our own onKeyDown.
    const quarter = within(menu).getByRole('menuitem', { name: '¼' })
    act(() => quarter.focus())
    expect(onPreview).toHaveBeenLastCalledWith('1/4')
    expect(within(menu).getByText('showing ¼ on the page · click to keep, esc to go back')).toBeInTheDocument()

    // Base UI's own ↓ (not our ← →) walks to the next cell.
    const third = within(menu).getByRole('menuitem', { name: '⅓' })
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(third).toHaveFocus())
    expect(onPreview).toHaveBeenLastCalledWith('1/3')
    expect(within(menu).getByText('showing ⅓ on the page · click to keep, esc to go back')).toBeInTheDocument()
  })

  it('→ then ↓ out of the row clears the preview and the note', async () => {
    const user = userEvent.setup()
    const onPreview = jest.fn()
    render(<Harness width="1/2" onPreview={onPreview} withExtraItem />)
    const menu = await openMenu(user)
    const threeQuarters = within(menu).getByRole('menuitem', { name: '¾' })
    const full = within(menu).getByRole('menuitem', { name: 'full' })
    const extraItem = within(menu).getByRole('menuitem', { name: 'extra item' })

    // → (the row's own key) walks to `full`, the row's last cell.
    act(() => threeQuarters.focus())
    await user.keyboard('{ArrowRight}')
    expect(full).toHaveFocus()
    expect(onPreview).toHaveBeenLastCalledWith('full')

    // ↓ (Base UI's own key) leaves the row for the next group below it.
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(extraItem).toHaveFocus())
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(within(menu).queryByText(/showing/)).not.toBeInTheDocument()
  })

  it('↵ on a focused cell keeps the width', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness width="1/2" onSelect={onSelect} />)
    const menu = await openMenu(user)
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    act(() => twoThirds.focus())
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('2/3')
  })

  it('size="mobile": 44px cells, 12px radius, 17px fraction / 12px mono', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" size="mobile" />)
    const menu = await openMenu(user)
    const half = within(menu).getByRole('menuitem', { name: '½' })
    for (const cls of ['h-[44px]', 'rounded-[12px]', 'text-[17px]']) {
      expect(classesOf(half)).toContain(cls)
    }
    const full = within(menu).getByRole('menuitem', { name: 'full' })
    for (const cls of ['h-[44px]', 'rounded-[12px]', 'text-[12px]']) {
      expect(classesOf(full)).toContain(cls)
    }
  })

  it('size="mobile": the note is always the phone note, regardless of preview', async () => {
    const user = userEvent.setup()
    render(<Harness width="1/2" size="mobile" />)
    const menu = await openMenu(user)
    const phoneNote = 'widths show on wider screens. on a phone every block is full.'
    expect(within(menu).getByText(phoneNote)).toBeInTheDocument()
    const twoThirds = within(menu).getByRole('menuitem', { name: '⅔' })
    await user.hover(twoThirds)
    expect(within(menu).getByText(phoneNote)).toBeInTheDocument()
    expect(within(menu).queryByText(/showing ⅔/)).not.toBeInTheDocument()
  })
})
