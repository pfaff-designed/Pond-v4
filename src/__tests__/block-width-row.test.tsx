/**
 * `BlockWidthRow`, the block menu's `width` group content (6x): six cells in
 * order, the current width filled ink, `full` filled at rest when the block
 * has none.
 */

import React, { useRef, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondMenu, type PondMenuGroup } from '@/components/molecules/PondMenu'
import { BlockWidthRow } from '@/components/molecules/BlockWidthRow'
import type { BlockWidth } from '@/lib/modules/content'

// This harness's groups hold only `content` (the width row), never a selectable
// `action` row, so the menu's action type is uninhabited.
type NoAction = never

const Harness = ({
  width,
  onPreview,
}: {
  width: BlockWidth | undefined
  onPreview?: (width: BlockWidth | null) => void
}) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const groups: PondMenuGroup<NoAction>[] = [
    {
      id: 'width',
      label: 'width',
      heading: true,
      content: <BlockWidthRow width={width} onSelect={() => {}} onPreview={onPreview} />,
    },
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
})
