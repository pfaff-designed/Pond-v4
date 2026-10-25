/**
 * `PageLinkView` (KAN-122, 6k frame 2): one focusable row, no card. Resolved
 * renders the live title + chevron and opens the page on click/Enter; unresolved
 * (deleted, or no `PageLinkProvider` mounted) reads "page in trash", ink .68, no
 * chevron, not clickable.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageLinkProvider, type PageLinkCapabilities } from './context'
import type { PageRef } from './resolve'
import { PageLinkView } from './view'
import type { PageLinkBlock } from './schema'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import { BlockRowProvider } from '../block-row-context'
import { POND_BLOCK_SELECTED_RING } from '@/components/organisms/PondBlock'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'

// The real hook talks to Supabase through react-query; mocked here (mirrors
// `view/view.test.tsx`'s `use-collection-rows` mock) so this file can assert
// the row text without a QueryClientProvider.
let mockBlockCount = 0
jest.mock('./use-block-count', () => ({
  useBlockCount: () => mockBlockCount,
}))

const block: PageLinkBlock = { id: 'pl-1', type: 'page-link', pageId: 'page-1' }

const pageRow: PageRow = {
  id: 'page-1',
  parent_id: null,
  type: 'page',
  title: 'cabinets',
  order: 0,
  updated_at: '2026-01-01T00:00:00.000Z',
}

const ref: PageRef = { id: 'page-1', title: 'cabinets', type: 'page', isNew: false }
const newRef: PageRef = { id: 'page-1', title: 'cabinets', type: 'page', isNew: true }

const capabilities = (resolved: PageRef | null): PageLinkCapabilities => ({
  resolvePage: jest.fn(() => resolved),
  navigateToPage: jest.fn(),
  createLinkedPage: jest.fn(),
  renamePage: jest.fn(),
  searchPages: jest.fn(() => []),
})

describe('PageLinkView — resolved', () => {
  beforeEach(() => {
    mockBlockCount = 0
  })

  it('renders the title and chevron, and clicking navigates', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('cabinets')).toBeInTheDocument()
    expect(screen.getByText('›')).toBeInTheDocument()
    expect(screen.queryByText('page in trash')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Open cabinets' }))
    expect(caps.navigateToPage).toHaveBeenCalledWith(ref)
  })

  it('leaves a ⌘-click unprevented for the browser\'s own new-tab handling', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Open cabinets' }), {
      metaKey: true,
    })
    expect(notPrevented).toBe(true)
    expect(caps.navigateToPage).not.toHaveBeenCalled()
  })

  it('leaves a Ctrl-click unprevented for the browser\'s own new-tab handling', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Open cabinets' }), {
      ctrlKey: true,
    })
    expect(notPrevented).toBe(true)
    expect(caps.navigateToPage).not.toHaveBeenCalled()
  })

  it('is not natively draggable, so a dragstart on the row never reaches the block canvas\'s reorder handler', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    const row = screen.getByRole('link', { name: 'Open cabinets' })
    expect(row).toHaveAttribute('draggable', 'false')
    const notPrevented = fireEvent.dragStart(row)
    expect(notPrevented).toBe(false)
  })

  it('opens the page on Enter', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    fireEvent.keyDown(screen.getByRole('link', { name: 'Open cabinets' }), { key: 'Enter' })
    expect(caps.navigateToPage).toHaveBeenCalledWith(ref)
  })

  it('renders the `new` chip when the linked page is new', () => {
    const caps = capabilities(newRef)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('new')).toBeInTheDocument()
  })

  it('does not render the `new` chip once the linked page is no longer new', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.queryByText('new')).not.toBeInTheDocument()
  })

  it('renders "0 blocks" for an empty linked page', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('0 blocks')).toBeInTheDocument()
  })

  it('renders singular "1 block"', () => {
    mockBlockCount = 1
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('1 block')).toBeInTheDocument()
  })

  it('updates the row text when the linked page\'s block count changes', () => {
    mockBlockCount = 2
    const caps = capabilities(ref)
    const { rerender } = render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('2 blocks')).toBeInTheDocument()

    mockBlockCount = 5
    rerender(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('5 blocks')).toBeInTheDocument()
    expect(screen.queryByText('2 blocks')).not.toBeInTheDocument()
  })
})

describe('PageLinkView — selected', () => {
  const ringClasses = POND_BLOCK_SELECTED_RING.split(' ')

  it('carries the selected ring when the canvas has the row selected', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <BlockRowProvider value={{ selected: true, stepOut: jest.fn() }}>
          <PageLinkView data={block} />
        </BlockRowProvider>
      </PageLinkProvider>
    )
    const row = screen.getByRole('link', { name: 'Open cabinets' })
    for (const cls of ringClasses) expect(row).toHaveClass(cls)
  })

  it('carries no selected ring when the row is not selected', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <BlockRowProvider value={{ selected: false, stepOut: jest.fn() }}>
          <PageLinkView data={block} />
        </BlockRowProvider>
      </PageLinkProvider>
    )
    const row = screen.getByRole('link', { name: 'Open cabinets' })
    for (const cls of ringClasses) expect(row).not.toHaveClass(cls)
  })
})

describe('PageLinkView — hover prefetch (KAN-388)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('prefetches the linked page after the row holds the pointer for 60ms', () => {
    const caps = capabilities(ref)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
    render(
      <QueryClientProvider client={queryClient}>
        <PageLinkProvider value={caps}>
          <PageLinkView data={block} />
        </PageLinkProvider>
      </QueryClientProvider>
    )

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Open cabinets' }))
    jest.advanceTimersByTime(60)

    expect(prefetchSpy).toHaveBeenCalledTimes(1)
    expect(prefetchSpy.mock.calls[0][0].queryKey).toEqual(['page', 'page-1'])
  })

  it('never fires if the pointer leaves before 60ms', () => {
    const caps = capabilities(ref)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
    render(
      <QueryClientProvider client={queryClient}>
        <PageLinkProvider value={caps}>
          <PageLinkView data={block} />
        </PageLinkProvider>
      </QueryClientProvider>
    )

    const row = screen.getByRole('link', { name: 'Open cabinets' })
    fireEvent.pointerEnter(row)
    jest.advanceTimersByTime(20)
    fireEvent.pointerLeave(row)
    jest.advanceTimersByTime(1000)

    expect(prefetchSpy).not.toHaveBeenCalled()
  })
})

describe('PageLinkView — href never read from window during render, even while the pond context is unresolved (KAN-474 follow-up)', () => {
  const pondContextValue = (pond: Pond | null): PondContextValue => ({
    pond,
    ponds: pond ? [pond] : [],
    loading: pond === null,
    reload: jest.fn(),
    addPond: jest.fn(),
    patchPond: jest.fn(),
  })

  it('a window URL carrying ?pond=p2 is ignored while the pond context is still unresolved, then the href updates once the pond resolves', () => {
    // Simulates the real cold-load condition the bug needed: the address
    // already carries `?pond=p2` (e.g. a direct link into a second pond),
    // but `usePondId()` hasn't resolved it yet — `null`, same as the server.
    window.history.replaceState({}, '', '/workspace?pond=p2')
    const caps = capabilities(ref)
    const { rerender } = render(
      <PondContext.Provider value={pondContextValue(null)}>
        <PageLinkProvider value={caps}>
          <PageLinkView data={block} />
        </PageLinkProvider>
      </PondContext.Provider>
    )
    const row = screen.getByRole('link', { name: 'Open cabinets' })
    expect(row.getAttribute('href')).not.toContain('pond=')

    rerender(
      <PondContext.Provider
        value={pondContextValue({ id: 'p2', name: 'p2', glyph: null, theme: 'default', order: 0 })}
      >
        <PageLinkProvider value={caps}>
          <PageLinkView data={block} />
        </PageLinkProvider>
      </PondContext.Provider>
    )
    expect(row.getAttribute('href')).toContain('pond=p2')
  })
})

describe('PageLinkView — unresolved', () => {
  it('reads "page in trash", not clickable, no chevron, when the page is gone', () => {
    const caps = capabilities(null)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    expect(screen.getByText('page in trash')).toBeInTheDocument()
    expect(screen.queryByText('›')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reads the same way with no provider and no QueryClient mounted', () => {
    render(<PageLinkView data={block} />)
    expect(screen.getByText('page in trash')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reads "page in trash" with no provider when no cached row matches', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <PageLinkView data={block} />
      </QueryClientProvider>
    )
    expect(screen.getByText('page in trash')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('resolves the title from the pages-list cache with no provider (the change-log diff card)', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(pagesKey(), [pageRow])
    render(
      <QueryClientProvider client={queryClient}>
        <PageLinkView data={block} />
      </QueryClientProvider>
    )
    expect(screen.getByText('cabinets')).toBeInTheDocument()
    expect(screen.queryByText('page in trash')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
