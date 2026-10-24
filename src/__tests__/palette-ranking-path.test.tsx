/**
 * KAN-390 PATH_STEPS, steps 2-4 — the real ranking and recents path, without
 * mounting the whole shell: `ShellCommands`/`DocumentPanel` pull in a
 * `QueryClient`, `next/navigation` and pond-context that have nothing to do
 * with ranking itself (an earlier whole-shell attempt timed out twice). This
 * drives `writeRecent` → `readRecentPageIds` → `paletteItems` → `PondCommand`
 * exactly as the shell does, the way `command-palette.test.tsx` drives
 * `PondCommand` directly.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PondCommand } from '@/components/organisms/PondCommand'
import { paletteItems } from '@/lib/pages/palette-items'
import { readRecentPageIds, writeRecent } from '@/lib/pages/recent-pages'
import type { PageRow } from '@/lib/pages/tree'

const PATH = {
  glyph: 'ramp',
  trail: [{ title: 'life', to: { kind: 'home' as const } }],
  current: 'projects',
  role: null,
}

const row = (p: Partial<PageRow> & Pick<PageRow, 'id' | 'title'>): PageRow => ({
  parent_id: null,
  type: 'page',
  order: 0,
  updated_at: '',
  ...p,
})

// Tree order: Improvements before Projects — the ticket's own "pro" example.
const PAGES: PageRow[] = [
  row({ id: 'improvements', title: 'Improvements' }),
  row({ id: 'projects', title: 'Projects' }),
]

describe('KAN-390 path test A — recent, ranked above a mid-word match, underlined, opens on ↵', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('a page opened by its own route lands in `recent`; typing ranks it first; ↵ opens it', async () => {
    writeRecent({ id: 'projects', type: 'page', title: 'Projects' }, 'pond-1')

    const visits = readRecentPageIds('pond-1')
    const items = paletteItems(PAGES, visits, null)
    const onSelect = jest.fn()

    render(
      <PondCommand
        path={PATH}
        open
        items={items}
        visits={visits}
        onSelect={onSelect}
        onOpenChange={jest.fn()}
      />
    )

    const input = screen.getByRole('combobox', { name: 'command palette' })

    // Empty query: `recent` holds Projects, and only Projects.
    const recentOptions = screen.getAllByRole('option')
    expect(recentOptions).toHaveLength(1)
    expect(recentOptions[0]).toHaveTextContent('Projects')

    const user = userEvent.setup()
    await user.type(input, 'pro')

    // Typing: Projects (prefix tier) outranks Improvements (substring tier),
    // reversing the tree order the ticket calls out — scoped to the `pages`
    // group rows, since `report a problem` and `ask pond about "pro"` also
    // subsequence/substring-match and list under `actions`.
    const pages = screen.getAllByRole('option').filter((o) => o.getAttribute('data-kind') === 'page')
    expect(pages.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Projects'),
      expect.stringContaining('Improvements'),
    ])
    expect(pages[0].querySelector('[data-part="hit"]')!.textContent).toBe('Pro')

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'projects' }))
  })
})

describe('KAN-390 path test B — a subsequence action is found, underlined per character; recents stay per pond', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('`nwp` finds `new page` under `actions` with n, w, p each underlined', async () => {
    const items = paletteItems(PAGES, [], null)

    render(
      <PondCommand
        path={PATH}
        open
        items={items}
        visits={[]}
        onSelect={jest.fn()}
        onOpenChange={jest.fn()}
      />
    )

    const input = screen.getByRole('combobox', { name: 'command palette' })
    const user = userEvent.setup()
    await user.type(input, 'nwp')

    const newPageRow = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('data-kind') === 'action' && o.textContent?.includes('new page'))
    expect(newPageRow).toBeDefined()
    const hits = Array.from(newPageRow!.querySelectorAll('[data-part="hit"]')).map((h) => h.textContent)
    expect(hits).toEqual(['n', 'w', 'p'])
  })

  it('each pond keeps its own recents', () => {
    writeRecent({ id: 'projects', type: 'page', title: 'Projects' }, 'pond-1')

    expect(readRecentPageIds('pond-2')).toEqual([])

    writeRecent({ id: 'improvements', type: 'page', title: 'Improvements' }, 'pond-2')

    expect(readRecentPageIds('pond-1')).toEqual(['projects'])
    expect(readRecentPageIds('pond-2')).toEqual(['improvements'])
  })
})
