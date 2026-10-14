/**
 * `PondMenu` kind `block`: the DC's values on the box, heads, items, values and
 * rules, and the behaviour a menu owes the person driving it — opened from its
 * trigger, walked and picked from the keyboard (typeahead included), dismissed
 * by Escape, an outside press or Tab, with focus put back where it belongs and
 * no key leaking to whatever hosts the trigger.
 */

import React, { useRef, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondMenu, type PondMenuGroup } from '@/components/molecules/PondMenu'

type Pick = 'table' | 'checklist' | 'text' | 'copy-link' | 'delete'

const GROUPS: PondMenuGroup<Pick>[] = [
  {
    id: 'turn-into',
    label: 'turn into',
    heading: true,
    items: [
      { id: 'table', label: 'table', value: '3 rows · 2 columns', action: 'table' },
      { id: 'checklist', label: 'checklist', action: 'checklist' },
      { id: 'text', label: 'text', action: 'text' },
    ],
  },
  {
    id: 'block',
    label: 'block',
    items: [
      { id: 'copy-link', label: 'copy link to block', action: 'copy-link' },
      { id: 'delete', label: 'delete', action: 'delete' },
    ],
  },
]

interface HarnessProps {
  groups?: PondMenuGroup<Pick>[]
  size?: 'desktop' | 'mobile'
  onSelect?: (pick: Pick) => void
  onHostKeyDown?: () => void
}

/** The field opens the menu on F2 — an open that does not come from the trigger. */
const Harness = ({ groups = GROUPS, size, onSelect = jest.fn(), onHostKeyDown }: HarnessProps) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef} onKeyDown={onHostKeyDown}>
      <input
        aria-label="field"
        onKeyDown={(e) => {
          if (e.key === 'F2') setOpen(true)
        }}
      />
      <PondMenu
        kind="block"
        label="block menu"
        size={size}
        groups={groups}
        open={open}
        onOpenChange={setOpen}
        onSelect={onSelect}
        trigger={<button type="button">handle</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
      />
      <button type="button">after</button>
    </div>
  )
}

const handle = () => screen.getByRole('button', { name: 'handle' })
const menu = () => screen.getByRole('menu', { name: 'block menu' })
const items = () => within(menu()).getAllByRole('menuitem')

const openWithPointer = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(handle())
  await screen.findByRole('menu', { name: 'block menu' })
}

const openWithKeyboard = async (user: ReturnType<typeof userEvent.setup>) => {
  handle().focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('menu', { name: 'block menu' })
  await waitFor(() => expect(items()[0]).toHaveFocus())
}

describe('PondMenu kind block — structure and ARIA', () => {
  it('opens from its trigger as a named menu, its groups in order', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(handle()).toHaveAttribute('aria-haspopup', 'menu')
    await openWithPointer(user)

    const groups = within(menu()).getAllByRole('group')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toBe(within(menu()).getByRole('group', { name: 'turn into' }))
    expect(groups[1]).toBe(within(menu()).getByRole('group', { name: 'block' }))
    expect(items().map((i) => i.textContent)).toEqual([
      'table3 rows · 2 columns',
      'checklist',
      'text',
      'copy link to block',
      'delete',
    ])
  })

  it('draws a head only for a group that has one, and a rule only between groups', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    expect(within(menu()).getByText('turn into')).toBeInTheDocument()
    expect(within(menu()).queryByText(/^block$/)).not.toBeInTheDocument()
    expect(within(menu()).getAllByRole('separator')).toHaveLength(1)
  })

  it('leaves out an empty group, and the rule that would have led to it', async () => {
    const user = userEvent.setup()
    render(<Harness groups={[{ ...GROUPS[0], items: [] }, GROUPS[1]]} />)
    await openWithPointer(user)
    expect(within(menu()).queryByText('turn into')).not.toBeInTheDocument()
    expect(within(menu()).queryAllByRole('separator')).toHaveLength(0)
    expect(within(menu()).getAllByRole('group')).toHaveLength(1)
  })

  it('draws a group’s content row under its head', async () => {
    const user = userEvent.setup()
    const row: PondMenuGroup<Pick> = {
      id: 'row',
      label: 'width',
      heading: true,
      content: <div data-testid="row">½</div>,
    }
    render(<Harness groups={[GROUPS[0], row, GROUPS[1]]} />)
    await openWithPointer(user)
    const group = within(menu()).getByRole('group', { name: 'width' })
    expect(within(group).getByTestId('row')).toHaveTextContent('½')
    expect(within(menu()).getAllByRole('separator')).toHaveLength(2)
  })
})

describe('PondMenu kind block — the DC’s values', () => {
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(' ')

  it('the box: 260 wide, padding 6, radius 16, gap 1, sans, the menu glass', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    const box = classesOf(menu())
    for (const cls of [
      'w-[260px]',
      'p-[6px]',
      'rounded-[16px]',
      'gap-[1px]',
      'font-sans',
      '[background:var(--mn-menu-bg)]',
      '[border:var(--mn-menu-border)]',
      '[box-shadow:var(--mn-menu-shadow)]',
      'backdrop-blur-[24px]',
      'backdrop-saturate-[1.3]',
    ]) {
      expect(box).toContain(cls)
    }
  })

  it('the head: 6px 10px 4px, 10.5 / 500 / .1em, uppercase, ink 68', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    const head = classesOf(within(menu()).getByText('turn into'))
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

  it('an item: 7px 10px, radius 10, 13px, gap 9, ink .07 when highlighted — its value mono 10.5 at ink 68', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    const table = items()[0]
    for (const cls of [
      'py-[7px]',
      'px-[10px]',
      'rounded-[10px]',
      'text-[13px]',
      'gap-[9px]',
      'data-[highlighted]:bg-mn-hover-fill',
    ]) {
      expect(classesOf(table)).toContain(cls)
    }
    const value = classesOf(within(table).getByText('3 rows · 2 columns'))
    for (const cls of ['font-mono', 'text-[10.5px]', 'text-mn-text-secondary']) {
      expect(value).toContain(cls)
    }
  })

  it('the rule: 1px, margin 4px 8px, ink .09', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    const rule = classesOf(within(menu()).getByRole('separator'))
    for (const cls of ['h-px', 'my-[4px]', 'mx-[8px]', 'bg-mn-text/[0.09]']) {
      expect(rule).toContain(cls)
    }
  })

  it('on a phone: 350 wide, items at least 44 tall at 0 12px and 15px', async () => {
    const user = userEvent.setup()
    render(<Harness size="mobile" />)
    await openWithPointer(user)
    expect(classesOf(menu())).toContain('w-[350px]')
    const item = classesOf(items()[0])
    for (const cls of ['min-h-[44px]', 'px-[12px]', 'text-[15px]']) {
      expect(item).toContain(cls)
    }
    expect(item).not.toContain('py-[7px]')
  })
})

describe('PondMenu kind block — keyboard', () => {
  it('opened from the keyboard, the first item takes focus; ↓ and ↑ walk the items across groups', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(items()[3]).toHaveFocus()
    expect(items()[3]).toHaveAttribute('data-highlighted')
    await user.keyboard('{ArrowUp}')
    expect(items()[2]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items()[4]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(items()[0]).toHaveFocus()
  })

  it('typeahead: a letter jumps to the item it starts', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)
    await user.keyboard('d')
    expect(within(menu()).getByRole('menuitem', { name: 'delete' })).toHaveFocus()
  })

  it('typeahead: the same letter again moves on to the next item it starts', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)
    await user.keyboard('c')
    expect(within(menu()).getByRole('menuitem', { name: 'checklist' })).toHaveFocus()
    await user.keyboard('c')
    expect(within(menu()).getByRole('menuitem', { name: 'copy link to block' })).toHaveFocus()
  })

  it('Enter picks the focused item, closes, and hands focus back to the trigger', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    await openWithKeyboard(user)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('checklist')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(handle()).toHaveFocus())
  })

  it('a click picks the item', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    await openWithPointer(user)
    await user.click(within(menu()).getByRole('menuitem', { name: 'delete' }))
    expect(onSelect).toHaveBeenCalledWith('delete')
  })

  it('keeps its keys to itself, so the host of its trigger never sees them', async () => {
    const user = userEvent.setup()
    const onHostKeyDown = jest.fn()
    render(<Harness onHostKeyDown={onHostKeyDown} />)
    await openWithPointer(user)
    await waitFor(() => expect(menu().contains(document.activeElement)).toBe(true))
    onHostKeyDown.mockClear()
    await user.keyboard('{Backspace}{ArrowDown}')
    expect(onHostKeyDown).not.toHaveBeenCalled()
  })
})

describe('PondMenu kind block — dismissal and focus', () => {
  it('Escape closes and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(handle()).toHaveFocus())
  })

  it('opened from elsewhere, Escape returns focus to where it was rather than the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('textbox', { name: 'field' }).focus()
    await user.keyboard('{F2}')
    await screen.findByRole('menu', { name: 'block menu' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'field' })).toHaveFocus())
  })

  it('a press outside that lands in a field leaves focus in that field', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    await user.click(screen.getByRole('textbox', { name: 'field' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByRole('textbox', { name: 'field' })).toHaveFocus()
  })

  it('a press outside closes it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithPointer(user)
    await user.click(screen.getByRole('textbox', { name: 'field' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('Tab leaves the menu and moves on to what follows the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)
    await user.tab()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
  })
})

type NewPagePick = 'page' | 'template'

const NEW_PAGE_GROUPS: PondMenuGroup<NewPagePick>[] = [
  {
    id: 'new-page',
    label: 'new page',
    items: [
      { id: 'page', label: 'page', value: 'blocks, text, databases', action: 'page' },
      { id: 'template', label: 'from a template', value: 'twelve to start from', action: 'template' },
    ],
  },
]

const NewPageHarness = () => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef}>
      <PondMenu
        kind="newPage"
        label="new page menu"
        groups={NEW_PAGE_GROUPS}
        open={open}
        onOpenChange={setOpen}
        onSelect={jest.fn()}
        trigger={<button type="button">new page</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
      />
    </div>
  )
}

describe('PondMenu kind newPage — the DC’s values', () => {
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(' ')

  it('the box: 300 wide', async () => {
    const user = userEvent.setup()
    render(<NewPageHarness />)
    await user.click(screen.getByRole('button', { name: 'new page' }))
    const menu = await screen.findByRole('menu', { name: 'new page menu' })
    expect(classesOf(menu)).toContain('w-[300px]')
  })

  it('an item: 8px 10px, radius 10, gap 2, label over hint, highlighted adds font-medium to the label alone', async () => {
    const user = userEvent.setup()
    render(<NewPageHarness />)
    await user.click(screen.getByRole('button', { name: 'new page' }))
    const menu = await screen.findByRole('menu', { name: 'new page menu' })
    const page = within(menu).getByRole('menuitem', { name: /^page/ })
    for (const cls of [
      'flex-col',
      'py-[8px]',
      'px-[10px]',
      'rounded-[10px]',
      'gap-[2px]',
      'text-[13.5px]',
      'data-[highlighted]:bg-mn-hover-fill',
    ]) {
      expect(classesOf(page)).toContain(cls)
    }
    expect(classesOf(page)).not.toContain('data-[highlighted]:font-medium')
    const label = classesOf(within(page).getByText('page'))
    expect(label).toContain('group-data-[highlighted]:font-medium')
    const hint = classesOf(within(page).getByText('blocks, text, databases'))
    for (const cls of ['font-mono', 'text-[10.5px]', 'text-mn-text-secondary']) {
      expect(hint).toContain(cls)
    }
    expect(hint.some((cls) => cls.includes('font-medium'))).toBe(false)
  })
})
