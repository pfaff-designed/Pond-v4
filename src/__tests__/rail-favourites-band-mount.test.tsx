/**
 * KAN-475 — the favourites band mounted above the rail tree: it resolves
 * `favouritePageIds` through the rail's own node index (dropping dead ids
 * without touching the persisted column), appears only once a favourite
 * resolves, opens a page through the same `onSelect` path a tree row uses,
 * and reads the open page's own band row as selected — not its tree row.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { RailView, type RailNode } from '@/components/organisms/Rail'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const node = (
  id: string,
  title: string,
  children: RailNode[] = [],
  parentId: string | null = null,
  order = 0
): RailNode => ({ id, parentId, type: 'page', title, order, children })

function renderRail(opts: {
  favouritePageIds?: readonly string[]
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const groceries = node('groceries', 'groceries', [], 'scratch')
  const budget = node('budget', 'budget', [], 'scratch')
  const scratch = node('scratch', 'Scratch', [groceries, budget])

  return render(
    <RailView
      tree={[scratch]}
      pondName="life"
      favouritePageIds={opts.favouritePageIds}
      selectedId={opts.selectedId ?? null}
      expanded={new Set(['scratch'])}
      lifeExpanded
      busyId={null}
      isLoading={false}
      isEmpty={false}
      onSelect={opts.onSelect ?? jest.fn()}
      onToggle={jest.fn()}
      onAddChild={jest.fn()}
      onDelete={jest.fn()}
      onRename={jest.fn()}
      onPickGlyph={jest.fn()}
      onLife={jest.fn()}
      onToggleLife={jest.fn()}
      onOpenDatabases={jest.fn()}
      canDrop={() => true}
      onMove={jest.fn()}
    />
  )
}

const band = () => document.querySelector('[data-part="favourites-band"]')

describe('rail — favourites band mount (KAN-475)', () => {
  it('appears only once a favourite resolves to a live page, dropping a dead id', () => {
    renderRail({ favouritePageIds: ['groceries', 'ghost-id'] })
    const rows = within(band() as HTMLElement).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['groceries'])
  })

  it('renders no band at all when every favourite id is dead/unresolved', () => {
    renderRail({ favouritePageIds: ['ghost-id'] })
    expect(band()).not.toBeInTheDocument()
  })

  it('renders no band at all with no favourites', () => {
    renderRail({})
    expect(band()).not.toBeInTheDocument()
  })

  it('clicking a band row opens that page through the existing open path', () => {
    const onSelect = jest.fn()
    renderRail({ favouritePageIds: ['groceries', 'budget'], onSelect })
    const rows = within(band() as HTMLElement).getAllByRole('listitem')
    const budgetRow = rows.find((r) => r.textContent === 'budget')
    budgetRow?.click()
    expect(onSelect).toHaveBeenCalledWith('budget')
  })

  it("reads the open page's band row as selected, not its tree row", () => {
    renderRail({ favouritePageIds: ['groceries', 'budget'], selectedId: 'groceries' })

    const groceriesBandRow = within(band() as HTMLElement)
      .getAllByRole('listitem')
      .find((r) => r.textContent === 'groceries')
    expect(groceriesBandRow).toHaveAttribute('aria-current', 'true')
    const budgetBandRow = within(band() as HTMLElement)
      .getAllByRole('listitem')
      .find((r) => r.textContent === 'budget')
    expect(budgetBandRow).not.toHaveAttribute('aria-current')

    // The same page's tree row is a different element entirely — selection on
    // the band row is not just a read of the tree row's own aria-selected.
    const tree = screen.getByRole('tree', { name: 'Workspace' })
    const groceriesTreeRow = within(tree).getByRole('treeitem', { name: 'groceries' })
    expect(groceriesTreeRow).not.toBe(groceriesBandRow)
  })
})
