/**
 * Integration tests for the Kanban card → page preview modal (#64).
 *
 * A board card is a collection row, and a row IS a page (`type='row'`, F27's
 * "view over pages" world) — so clicking a card opens a Press modal previewing
 * that page's blocks read-only, with an "Open page" expand that navigates to
 * the full page (via the F27 PageLink capability seam) and closes the modal.
 *
 * Covers the resolved-spec ACs:
 *   1. click card → modal preview shows the linked page's content;
 *   2. "Open page" navigates (navigateToPage) and closes the modal;
 *   3. Esc closes (backdrop close is base-ui behavior, exercised in the
 *      Storybook play test where a real pointer exists);
 *   4. a card whose page is gone degrades to a calm notice — no broken modal,
 *      no dead "Open page" button.
 *
 * RTL + jest mocks for Supabase/pages client, house-style (create-page-flow-ui).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks — must be defined before imports ─────────────────────────

const mockGetPage = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

import { CardPreviewModal } from '@/components/organisms/CardPreviewModal'
import { PageLinkProvider, type PageLinkCapabilities } from '@/lib/modules/page-link/context'
import { CollectionView } from '@/lib/modules/view/view'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { PropertySchema } from '@/lib/properties/schema'

// ── Fixtures ────────────────────────────────────────────────────────────────

const rowPage = {
  id: 'row-1',
  parentId: 'coll-1',
  type: 'row',
  title: 'Trim the rim',
  blocks: [{ id: 'b1', type: 'text', content: 'Bevel the foot ring before it dries.' }],
  props: {},
  order: 0,
}

const boardSchema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do', color: 'zinc' },
      { id: 'o-doing', label: 'Doing', color: 'amber' },
    ],
  },
]

const boardRows: CollectionRow[] = [
  { id: 'row-1', title: 'Trim the rim', values: { 'p-status': 'o-doing' } },
  { id: 'row-2', title: 'Wedge stoneware', values: { 'p-status': 'o-todo' } },
]

const boardConfig: ViewBlock = { id: 'v1', type: 'view', mode: 'board', groupBy: 'p-status' }

function makeCapabilities(): PageLinkCapabilities {
  return {
    resolvePage: jest.fn().mockReturnValue(null),
    navigateToPage: jest.fn(),
    createLinkedPage: jest.fn(),
    renamePage: jest.fn(),
    searchPages: jest.fn().mockReturnValue([]),
  }
}

function renderModal({
  capabilities,
  onOpenChange = jest.fn(),
}: { capabilities?: PageLinkCapabilities | null; onOpenChange?: (open: boolean) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const modal = (
    <CardPreviewModal rowId="row-1" fallbackTitle="Trim the rim" open onOpenChange={onOpenChange} />
  )
  render(
    <QueryClientProvider client={queryClient}>
      {capabilities ? <PageLinkProvider value={capabilities}>{modal}</PageLinkProvider> : modal}
    </QueryClientProvider>
  )
  return { onOpenChange }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPage.mockResolvedValue(rowPage)
})

// ── AC 1: the modal previews the page's blocks ─────────────────────────────

describe('CardPreviewModal — preview (AC 1)', () => {
  it('shows the page title and its blocks read-only', async () => {
    renderModal({ capabilities: makeCapabilities() })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(await screen.findByText('Trim the rim')).toBeInTheDocument()
    expect(await screen.findByText(/Bevel the foot ring/)).toBeInTheDocument()
    // Read-preview: no editors in the modal body.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows a calm empty note for a page with no blocks (still openable)', async () => {
    mockGetPage.mockResolvedValue({ ...rowPage, blocks: [] })
    renderModal({ capabilities: makeCapabilities() })

    expect(await screen.findByText('This page has no content yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open page/ })).toBeInTheDocument()
  })
})

// ── AC 2: expand / Open page navigates and closes ──────────────────────────

describe('CardPreviewModal — open page (AC 2)', () => {
  it('navigates to the full page via the F27 seam and closes the modal', async () => {
    const capabilities = makeCapabilities()
    const onOpenChange = jest.fn()
    renderModal({ capabilities, onOpenChange })

    const open = await screen.findByRole('button', { name: /Open page/ })
    await userEvent.click(open)

    expect(capabilities.navigateToPage).toHaveBeenCalledWith({
      id: 'row-1',
      title: 'Trim the rim',
      type: 'row',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('hides Open page when no navigation capability is mounted (Storybook host)', async () => {
    renderModal({ capabilities: null })

    await screen.findByText(/Bevel the foot ring/)
    expect(screen.queryByRole('button', { name: /Open page/ })).not.toBeInTheDocument()
  })
})

// ── AC 3: dismissal ─────────────────────────────────────────────────────────

describe('CardPreviewModal — dismissal (AC 3)', () => {
  it('closes on Escape', async () => {
    const onOpenChange = jest.fn()
    renderModal({ capabilities: makeCapabilities(), onOpenChange })

    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')

    // base-ui calls onOpenChange(open, eventDetails) — assert on the open flag.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled())
    expect(onOpenChange.mock.calls.at(-1)?.[0]).toBe(false)
  })
})

// ── AC 4: graceful degrade when the page is gone ────────────────────────────

describe('CardPreviewModal — missing page (AC 4)', () => {
  it('shows a calm notice and no Open page button', async () => {
    mockGetPage.mockResolvedValue(null)
    renderModal({ capabilities: makeCapabilities() })

    expect(await screen.findByText('This card doesn’t have a page to preview.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open page/ })).not.toBeInTheDocument()
  })
})

// ── The board seam: clicking a card raises onOpenCard ──────────────────────

describe('CollectionBoard — card click opens the preview (AC 1 seam)', () => {
  function renderBoard(overrides: Partial<React.ComponentProps<typeof CollectionView>> = {}) {
    const onOpenCard = jest.fn()
    render(
      <CollectionView
        config={boardConfig}
        schema={boardSchema}
        rows={boardRows}
        onOpenCard={onOpenCard}
        {...overrides}
      />
    )
    return { onOpenCard }
  }

  it('clicking a card body raises onOpenCard with the row id', () => {
    const { onOpenCard } = renderBoard()
    fireEvent.click(screen.getByText('Trim the rim'))
    expect(onOpenCard).toHaveBeenCalledWith('row-1')
  })

  it('exposes a keyboard-reachable ↗ open affordance per card', async () => {
    const { onOpenCard } = renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Open card: Wedge stoneware' }))
    expect(onOpenCard).toHaveBeenCalledTimes(1)
    expect(onOpenCard).toHaveBeenCalledWith('row-2')
  })

  it('does NOT open from the delete × or the title input (editable board)', () => {
    const onRemoveRow = jest.fn()
    const { onOpenCard } = renderBoard({
      editable: true,
      onRemoveRow,
      onRenameRow: jest.fn(),
    })

    fireEvent.click(screen.getByLabelText('Delete card: Trim the rim'))
    expect(onRemoveRow).toHaveBeenCalledWith('row-1')

    fireEvent.click(screen.getAllByLabelText('Card title')[0])
    expect(onOpenCard).not.toHaveBeenCalled()
  })

  it('renders cards without the open affordance when onOpenCard is absent', () => {
    render(<CollectionView config={boardConfig} schema={boardSchema} rows={boardRows} />)
    expect(screen.queryByRole('button', { name: /Open card/ })).not.toBeInTheDocument()
  })
})
