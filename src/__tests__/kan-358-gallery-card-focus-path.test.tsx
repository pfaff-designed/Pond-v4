/**
 * KAN-358 regression: a gallery card's own click must never bubble to the
 * block row underneath it. On the real `BlockCanvas` (not `CollectionGallery`
 * alone), `BlockEditor`'s `handleClick` focuses the block's own root on any
 * click that isn't an inner control's — which, before this fix, stole focus
 * off the clicked card and made the block-level ↵ fire (inserting an empty
 * text block) instead of the card's own ↵ (opening the record). The calendar
 * event never had this bug (`handleCalendarRowClick` already stops
 * propagation) — mirrors that fix on the gallery's card wrapper.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { CollectionRow } from '@/lib/modules/view/apply'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

const navigateToPage = jest.fn()
jest.mock('@/lib/modules/page-link/context', () => ({
  ...jest.requireActual('@/lib/modules/page-link/context'),
  usePageLinks: () => ({
    resolvePage: () => null,
    navigateToPage,
    createLinkedPage: jest.fn(),
    renamePage: jest.fn(),
    searchPages: () => [],
  }),
}))

const galleryRows: CollectionRow[] = [
  { id: 'pl0', title: 'plant 0', values: {} },
  { id: 'pl1', title: 'plant 1', values: {} },
]
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: [],
    rows: galleryRows,
    isLoading: false,
    isError: false,
    setValue: jest.fn(),
    addRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
  }),
}))

const gallery: Block = { id: 'b-gallery', type: 'view', mode: 'gallery' } as Block

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas blocks={blocks} pageId="page-1" onChange={setBlocks} />
  )
}

function renderCanvas(initial: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('BlockCanvas — a gallery card’s click stays the card’s, not the block’s (KAN-358)', () => {
  it('click focuses the card wrapper, not the block root; ↵ opens the record, not an inserted block', async () => {
    const user = userEvent.setup()
    renderCanvas([gallery])

    const card = await screen.findByText('plant 0')
    await user.click(card)

    const wrapper = document.querySelector('[data-row-focus="pl0"]')!
    expect(document.activeElement).toBe(wrapper)
    expect(document.getElementById('block-b-gallery')).not.toHaveFocus()

    await user.keyboard('{Enter}')

    expect(navigateToPage).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl0' }))
    expect(document.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })
})
