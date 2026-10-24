/**
 * KAN-492's path test: the pond switcher's rename & icon editor, walked through
 * the real `RailView` + `PondProvider` seam rather than `PondSwitcher` alone and
 * a static `PondContext.Provider` value (`PondSwitcher.stories.tsx`'s
 * `RailWithPonds`) — the optimistic write (`patchPond`) needs the real provider
 * to prove the rail header actually reads the change, not a stub.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RailView, type RailViewProps } from '@/components/organisms/Rail'
import { PondProvider } from '@/lib/pond/context'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
  updatePond: jest.fn(),
}))

import { listPonds, updatePond } from '@/lib/pond/client'

const POND = { id: 'p-life', name: 'Untitled Pond', glyph: 'waves-02', theme: 'paper', order: 0 }

// Minimal stub props — the same shape `PondSwitcher.stories.tsx`'s
// `RailWithPonds` uses, since this test only walks the head, not the tree.
const RAIL_PROPS: RailViewProps = {
  tree: [],
  pondName: 'Untitled Pond',
  selectedId: null,
  expanded: new Set<string>(),
  lifeExpanded: true,
  busyId: null,
  isLoading: false,
  isEmpty: true,
  onSelect: jest.fn(),
  onToggle: jest.fn(),
  onAddChild: jest.fn(),
  onDelete: jest.fn(),
  onRename: jest.fn(),
  onPickGlyph: jest.fn(),
  onLife: jest.fn(),
  onToggleLife: jest.fn(),
  onOpenDatabases: jest.fn(),
  canDrop: () => true,
  onMove: jest.fn(),
}

function renderRail() {
  return render(
    <PondProvider>
      <RailView {...RAIL_PROPS} />
    </PondProvider>
  )
}

beforeEach(() => {
  ;(listPonds as jest.Mock).mockReset().mockResolvedValue([POND])
  ;(updatePond as jest.Mock)
    .mockReset()
    .mockResolvedValue({ ...POND, name: 'Studio', glyph: 'house' })
})

describe('the rename & icon path, end to end (KAN-492)', () => {
  it('renames the pond from the switcher, and a fresh mount still reads the change', async () => {
    const user = userEvent.setup()
    const { container, unmount } = renderRail()

    // The plain fallback label also reads "Untitled Pond" before `listPonds`
    // resolves, so the switcher BUTTON appearing (not just the text) is what
    // proves the pond has actually loaded.
    await waitFor(() =>
      expect(container.querySelector('[data-part="pond-switcher"]')).not.toBeNull()
    )
    const switcher = container.querySelector<HTMLButtonElement>('[data-part="pond-switcher"]')!
    await user.click(switcher)
    expect(screen.getByRole('menu', { name: 'Ponds' })).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /rename & icon/ }))
    const nameField = screen.getByRole('textbox', { name: 'pond name' })
    expect(nameField).toHaveValue('Untitled Pond')
    expect(screen.getByRole('radiogroup', { name: 'glyph' })).toBeInTheDocument()

    await user.clear(nameField)
    await user.type(nameField, 'Studio')
    await user.click(screen.getByRole('radio', { name: 'house' }))
    await user.click(nameField)
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(updatePond).toHaveBeenCalledWith('p-life', { name: 'Studio', glyph: 'house' })
    )
    expect(container.querySelector('[data-part="pond-name"]')).toHaveTextContent('Studio')
    expect(container.querySelector('[data-pond-mark] [data-icon]')).toHaveAttribute(
      'data-icon',
      'house'
    )

    // A reload: a fresh provider and a fresh RailView, with `listPonds` now
    // resolving the row `updatePond` returned — nothing carries over from the
    // unmounted tree above but what the mocked read answers.
    unmount()
    ;(listPonds as jest.Mock).mockResolvedValue([{ ...POND, name: 'Studio', glyph: 'house' }])
    const reloaded = renderRail()

    await waitFor(() =>
      expect(reloaded.container.querySelector('[data-part="pond-switcher"]')).not.toBeNull()
    )
    expect(reloaded.container.querySelector('[data-part="pond-name"]')).toHaveTextContent('Studio')
    expect(reloaded.container.querySelector('[data-pond-mark] [data-icon]')).toHaveAttribute(
      'data-icon',
      'house'
    )
  })
})
