/**
 * The block menu's groups and their slots: the width row and `move into a new
 * page` appear only when supplied, in the DC's order, with one rule between
 * each pair of drawn groups — and every item's action reaches its one handler.
 */

import React, { useRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import { PondMenu } from '@/components/molecules/PondMenu'
import {
  blockMenuGroups,
  runBlockMenuAction,
  type BlockMenuAction,
  type BlockMenuHandlers,
  type BlockMenuSlots,
} from '@/components/organisms/block-menu'
import type { TodoBlock } from '@/lib/modules/todo/schema'
import type { PageLinkBlock } from '@/lib/modules/page-link/schema'
import type { TextBlock } from '@/lib/modules/text/schema'
import type { ViewBlock } from '@/lib/modules/view/schema'

const list: TodoBlock = {
  id: 'b-list',
  type: 'todo',
  marker: 'dot',
  items: [
    { id: 'i1', label: '2 eggs', checked: false },
    { id: 'i2', label: '1 lemon', checked: false },
  ],
}

const text: TextBlock = { id: 'b-text', type: 'text', content: 'hello' }

const OpenMenu = ({
  slots,
  size,
}: {
  slots?: BlockMenuSlots
  size?: 'desktop' | 'mobile'
}) => {
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef}>
      <PondMenu
        kind="block"
        label="block menu"
        groups={blockMenuGroups(list, slots, true, size)}
        open
        onOpenChange={() => {}}
        onSelect={() => {}}
        trigger={<button type="button">handle</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
      />
    </div>
  )
}

const menu = () => screen.getByRole('menu', { name: 'block menu' })

describe('blockMenuGroups slots', () => {
  it('without slots, on desktop: turn into, then the block’s own actions, no delete — one rule between them', () => {
    render(<OpenMenu />)
    const groups = within(menu()).getAllByRole('group')
    expect(groups).toHaveLength(2)
    expect(within(menu()).queryByRole('group', { name: 'width' })).not.toBeInTheDocument()
    expect(within(menu()).getAllByRole('separator')).toHaveLength(1)
    expect(
      within(within(menu()).getByRole('group', { name: 'block' }))
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['move to…', 'copy link to block'])
  })

  it('on mobile: the block group keeps `delete`, since a phone has no ⌘⌫', () => {
    render(<OpenMenu size="mobile" />)
    expect(
      within(within(menu()).getByRole('group', { name: 'block' }))
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['move to…', 'copy link to block', 'delete'])
  })

  it('with both: turn into, width, then move into a new page first among the block’s actions', () => {
    render(
      <OpenMenu
        slots={{ width: <div data-testid="width-row">½ · full</div>, moveIntoNewPage: true }}
      />
    )
    const groups = within(menu()).getAllByRole('group')
    expect(groups).toEqual([
      within(menu()).getByRole('group', { name: 'turn into' }),
      within(menu()).getByRole('group', { name: 'width' }),
      within(menu()).getByRole('group', { name: 'block' }),
    ])
    expect(within(groups[1]).getByTestId('width-row')).toBeInTheDocument()
    expect(within(menu()).getAllByRole('separator')).toHaveLength(2)
    expect(
      within(groups[2])
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['move into a new page', 'move to…', 'copy link to block'])
  })

  it('a rule sits between each pair of drawn groups and nowhere else', () => {
    render(<OpenMenu slots={{ width: <div>row</div>, moveIntoNewPage: true }} />)
    const kinds = Array.from(menu().children).map((child) => child.getAttribute('role'))
    expect(kinds).toEqual(['group', 'separator', 'group', 'separator', 'group'])
  })

  it('only the width row: two rules, and no `move into a new page`', () => {
    render(<OpenMenu slots={{ width: <div>row</div> }} />)
    expect(within(menu()).getAllByRole('separator')).toHaveLength(2)
    expect(
      within(menu()).queryByRole('menuitem', { name: 'move into a new page' })
    ).not.toBeInTheDocument()
  })
})

describe('blockMenuGroups delete label (mobile only — desktop drops the row)', () => {
  const pageLink: PageLinkBlock = { id: 'b-link', type: 'page-link', pageId: 'p-1' }

  it('reads `remove link` for a page-link block', () => {
    const group = blockMenuGroups(pageLink, {}, true, 'mobile').find((g) => g.id === 'block')
    expect(group?.items?.find((item) => item.id === 'delete')?.label).toBe('remove link')
  })

  it('reads `delete` for every other block type', () => {
    const group = blockMenuGroups(list, {}, true, 'mobile').find((g) => g.id === 'block')
    expect(group?.items?.find((item) => item.id === 'delete')?.label).toBe('delete')
  })

  it('on desktop, no block type gets a delete row', () => {
    const group = blockMenuGroups(list).find((g) => g.id === 'block')
    expect(group?.items?.find((item) => item.id === 'delete')).toBeUndefined()
  })
})

describe('blockMenuGroups `move to…` row (KAN-479)', () => {
  const pageLink: PageLinkBlock = { id: 'b-link', type: 'page-link', pageId: 'p-1' }
  const view: ViewBlock = { id: 'b-view', type: 'view', mode: 'board' }

  const moveToLabel = (block: TodoBlock | PageLinkBlock | ViewBlock) =>
    blockMenuGroups(block)
      .find((g) => g.id === 'block')
      ?.items?.find((item) => item.id === 'move-to')?.label

  it('shows `move to…` right after `move into a new page` for a checklist', () => {
    const items = blockMenuGroups(list, { moveIntoNewPage: true }).find((g) => g.id === 'block')
      ?.items
    expect(items?.map((item) => item.id)).toEqual(['move-into-new-page', 'move-to', 'copy-link'])
  })

  it('offers it for a checklist', () => {
    expect(moveToLabel(list)).toBe('move to…')
  })

  it('does not offer it for a view block', () => {
    expect(moveToLabel(view)).toBeUndefined()
  })

  it('does not offer it for a page-link block', () => {
    expect(moveToLabel(pageLink)).toBeUndefined()
  })

  it('carries the block its row was built for, through to its own handler', () => {
    const action = blockMenuGroups(list)
      .find((g) => g.id === 'block')
      ?.items?.find((item) => item.id === 'move-to')?.action as Extract<
      BlockMenuAction,
      { type: 'move-to' }
    >
    expect(action.block).toBe(list)
    const moveTo = jest.fn()
    runBlockMenuAction(action, { 'move-to': moveTo } as unknown as BlockMenuHandlers)
    expect(moveTo).toHaveBeenCalledWith(action)
  })
})

describe('blockMenuGroups turn-into: heading, quote, code', () => {
  const turnIntoItems = (apple: boolean) => blockMenuGroups(text, {}, apple)[0].items ?? []

  it('labels the new targets in the board’s lowercase, with heading 1–3’s chord hint pinned to Mac', () => {
    const items = turnIntoItems(true)
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ['heading 1', '⌥⌘1'],
      ['heading 2', '⌥⌘2'],
      ['heading 3', '⌥⌘3'],
      ['quote', undefined],
      ['code', undefined],
      ['page', undefined],
      ['list', undefined],
      ['checklist', undefined],
    ])
  })

  it('reads the same hints spelled out for a non-Mac platform, pinned', () => {
    const items = turnIntoItems(false)
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ['heading 1', 'Ctrl Alt 1'],
      ['heading 2', 'Ctrl Alt 2'],
      ['heading 3', 'Ctrl Alt 3'],
      ['quote', undefined],
      ['code', undefined],
      ['page', undefined],
      ['list', undefined],
      ['checklist', undefined],
    ])
  })
})

describe('runBlockMenuAction', () => {
  const handlers = (): jest.Mocked<BlockMenuHandlers> => ({
    'turn-into': jest.fn(),
    'move-into-new-page': jest.fn(),
    'move-to': jest.fn(),
    'copy-link': jest.fn(),
    delete: jest.fn(),
    'set-width': jest.fn(),
    'fit-height': jest.fn(),
  })

  it('hands each item’s action to its own handler, and to no other', () => {
    const groups = blockMenuGroups(list, { moveIntoNewPage: true })
    const actions = groups.flatMap((group) => group.items ?? []).map((item) => item.action)
    for (const action of actions) {
      const h = handlers()
      runBlockMenuAction(action, h)
      for (const [type, handler] of Object.entries(h)) {
        if (type === action.type) expect(handler).toHaveBeenCalledWith(action)
        else expect(handler).not.toHaveBeenCalled()
      }
    }
  })

  it('a turn-into action carries the conversion it will apply', () => {
    const [table] = blockMenuGroups(list)[0].items ?? []
    const action = table.action as Extract<BlockMenuAction, { type: 'turn-into' }>
    expect(action.conversion.target).toBe('table')
    expect(table.value).toBe('2 rows · 2 columns')
  })
})
