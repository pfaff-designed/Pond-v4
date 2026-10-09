/**
 * `PondMenu` kind `block` (`PondMenu.dc.html`): the box, heads, items, values
 * and rules carry the DC's own values; the menu is a real ARIA menu that the
 * keyboard can drive, and closing it from the keyboard hands focus back to the
 * handle that opened it.
 */

import React, { useRef } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondMenu, type PondMenuGroup } from '@/components/molecules/PondMenu'

const GROUPS: PondMenuGroup[] = [
  {
    id: 'turn-into',
    label: 'turn into',
    heading: true,
    items: [
      { id: 'turn-into:table', label: 'table', value: '3 rows · 2 columns' },
      { id: 'turn-into:checklist', label: 'checklist' },
      { id: 'turn-into:text', label: 'text' },
    ],
  },
  {
    id: 'block',
    label: 'block',
    items: [
      { id: 'copy-link', label: 'copy link to block' },
      { id: 'delete', label: 'delete' },
    ],
  },
]

interface HarnessProps {
  groups?: PondMenuGroup[]
  size?: 'desktop' | 'mobile'
  onSelect?: (id: string) => void
  onClose?: () => void
}

const Harness = ({
  groups = GROUPS,
  size,
  onSelect = jest.fn(),
  onClose = jest.fn(),
}: HarnessProps) => {
  const handleRef = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button ref={handleRef} type="button">
        handle
      </button>
      <button type="button">elsewhere</button>
      <PondMenu
        kind="block"
        label="block menu"
        size={size}
        groups={groups}
        onSelect={onSelect}
        onClose={onClose}
        anchorRef={handleRef}
      />
    </div>
  )
}

const items = () => screen.getAllByRole('menuitem')

describe('PondMenu kind block — structure and ARIA', () => {
  it('is a menu named for what it acts on, with its groups in order', () => {
    render(<Harness />)
    const menu = screen.getByRole('menu', { name: 'block menu' })
    const groups = within(menu).getAllByRole('group')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toBe(within(menu).getByRole('group', { name: 'turn into' }))
    expect(groups[1]).toBe(within(menu).getByRole('group', { name: 'block' }))
    expect(items().map((i) => i.textContent)).toEqual([
      'table3 rows · 2 columns',
      'checklist',
      'text',
      'copy link to block',
      'delete',
    ])
  })

  it('draws a head only for a group that has one, and a rule only between groups', () => {
    render(<Harness />)
    expect(screen.getByText('turn into')).toBeInTheDocument()
    expect(screen.queryByText(/^block$/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('separator')).toHaveLength(1)
  })

  it('leaves out an empty group, and the rule that would have led to it', () => {
    render(<Harness groups={[{ ...GROUPS[0], items: [] }, GROUPS[1]]} />)
    expect(screen.queryByText('turn into')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })
})

describe('PondMenu kind block — the DC’s values', () => {
  it('the box: 260 wide, padding 6, radius 16, gap 1, sans, the glass in both themes', () => {
    render(<Harness />)
    const box = screen.getByRole('menu').className
    for (const cls of [
      'w-[260px]',
      'p-[6px]',
      'rounded-[16px]',
      'gap-[1px]',
      'font-sans',
      'bg-[linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.76))]',
      'backdrop-blur-[24px]',
      'backdrop-saturate-[1.3]',
      'border-[rgba(255,255,255,.9)]',
      'shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.16)]',
      'dark:bg-[linear-gradient(160deg,rgba(74,73,64,.96),rgba(74,73,64,.86))]',
      'dark:border-[rgba(250,249,239,.09)]',
      'dark:shadow-[0_20px_54px_rgba(0,0,0,.45)]',
    ]) {
      expect(box.split(' ')).toContain(cls)
    }
  })

  it('the head: 6px 10px 4px, 10.5 / 500 / .1em, uppercase, ink 68', () => {
    render(<Harness />)
    const head = screen.getByText('turn into').className.split(' ')
    for (const cls of [
      'pt-[6px]',
      'px-[10px]',
      'pb-[4px]',
      'text-[10.5px]',
      'font-medium',
      'tracking-[.1em]',
      'uppercase',
      'text-mn-text-secondary',
    ]) {
      expect(head).toContain(cls)
    }
  })

  it('an item: 7px 10px, radius 10, 13px, gap 9 — and the value mono 10.5 at ink 68', () => {
    render(<Harness />)
    const table = items()[0]
    for (const cls of ['py-[7px]', 'px-[10px]', 'rounded-[10px]', 'text-[13px]', 'gap-[9px]']) {
      expect(table.className.split(' ')).toContain(cls)
    }
    const value = within(table).getByText('3 rows · 2 columns').className.split(' ')
    for (const cls of ['font-mono', 'text-[10.5px]', 'text-mn-text-secondary']) {
      expect(value).toContain(cls)
    }
  })

  it('the rule: 1px, margin 4px 8px, ink .09', () => {
    render(<Harness />)
    const rule = screen.getByRole('separator').className.split(' ')
    for (const cls of ['h-px', 'my-[4px]', 'mx-[8px]', 'bg-mn-text/[0.09]']) {
      expect(rule).toContain(cls)
    }
  })

  it('the active item wears ink .07, and only it', () => {
    render(<Harness />)
    const [first, second] = items()
    expect(first).toHaveAttribute('data-active', 'true')
    expect(first.className).toMatch(/data-\[active=true\]:bg-mn-hover-fill/)
    expect(second).not.toHaveAttribute('data-active')
  })

  it('on a phone: 350 wide, items at least 44 tall at 0 12px and 15px', () => {
    render(<Harness size="mobile" />)
    expect(screen.getByRole('menu').className.split(' ')).toContain('w-[350px]')
    const item = items()[0].className.split(' ')
    for (const cls of ['min-h-[44px]', 'px-[12px]', 'text-[15px]']) {
      expect(item).toContain(cls)
    }
    expect(item).not.toContain('py-[7px]')
  })
})

describe('PondMenu kind block — keyboard and dismiss', () => {
  it('takes focus on its first item when it opens', () => {
    render(<Harness />)
    expect(items()[0]).toHaveFocus()
  })

  it('↓ / ↑ walk the items across groups; Home and End jump to the ends', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(items()[3]).toHaveFocus()
    expect(items()[3]).toHaveAttribute('data-active', 'true')
    await user.keyboard('{ArrowUp}')
    expect(items()[2]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items()[4]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items()[4]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(items()[0]).toHaveFocus()
  })

  it('Enter and Space pick the active item, then hand focus back to the handle', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('turn-into:checklist')
    expect(screen.getByRole('button', { name: 'handle' })).toHaveFocus()
  })

  it('Space picks too', () => {
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    fireEvent.keyDown(items()[0], { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('turn-into:table')
  })

  it('a click picks the item', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    await user.click(screen.getByRole('menuitem', { name: 'delete' }))
    expect(onSelect).toHaveBeenCalledWith('delete')
  })

  it('Escape closes and returns focus to the handle', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'handle' })).toHaveFocus()
  })

  it('Tab closes rather than wandering out of an open menu', () => {
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(items()[0], { key: 'Tab' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'handle' })).toHaveFocus()
  })

  it('keeps its keys to itself, so the block under it never sees them', () => {
    const onKeyDown = jest.fn()
    render(
      <div onKeyDown={onKeyDown}>
        <Harness />
      </div>
    )
    fireEvent.keyDown(items()[0], { key: 'Backspace' })
    fireEvent.keyDown(items()[0], { key: 'ArrowDown' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('a pointer-down outside closes it; one on the handle is left to the handle’s toggle', () => {
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'handle' }))
    fireEvent.pointerDown(items()[1])
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hovering an item makes it the active one', () => {
    render(<Harness />)
    fireEvent.mouseEnter(items()[2])
    expect(items()[2]).toHaveAttribute('data-active', 'true')
    expect(items()[2]).toHaveFocus()
  })
})
