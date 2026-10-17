/**
 * `PageLinkView` (KAN-122, 6k frame 2): one focusable row, no card. Resolved
 * renders the live title + chevron and opens the page on click/Enter; unresolved
 * (deleted, or no `PageLinkProvider` mounted) reads "page in trash", ink .68, no
 * chevron, not clickable.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PageLinkProvider, type PageLinkCapabilities } from './context'
import type { PageRef } from './resolve'
import { PageLinkView } from './view'
import type { PageLinkBlock } from './schema'

const block: PageLinkBlock = { id: 'pl-1', type: 'page-link', pageId: 'page-1' }

const ref: PageRef = { id: 'page-1', title: 'cabinets', type: 'page', isNew: false }

const capabilities = (resolved: PageRef | null): PageLinkCapabilities => ({
  resolvePage: jest.fn(() => resolved),
  navigateToPage: jest.fn(),
  createLinkedPage: jest.fn(),
  renamePage: jest.fn(),
  searchPages: jest.fn(() => []),
})

describe('PageLinkView — resolved', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Open cabinets' }))
    expect(caps.navigateToPage).toHaveBeenCalledWith(ref)
  })

  it('opens the page on Enter', () => {
    const caps = capabilities(ref)
    render(
      <PageLinkProvider value={caps}>
        <PageLinkView data={block} />
      </PageLinkProvider>
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open cabinets' }), { key: 'Enter' })
    expect(caps.navigateToPage).toHaveBeenCalledWith(ref)
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

  it('reads the same way with no provider mounted', () => {
    render(<PageLinkView data={block} />)
    expect(screen.getByText('page in trash')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
