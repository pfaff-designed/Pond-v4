/**
 * #58 — the resizable editor column, wired end-to-end through DocumentPanel:
 * the column's max-width is user-set via the ContentWidthHandle on its right
 * edge, persisted to localStorage (survives reload) and clamped to the band.
 *
 * #111 deleted the standalone `timeline` block, and with it the case that pinned
 * "a %-positioned gantt bar reflows with the column". Its replacement is the `view`
 * block's gantt MODE, which needs a collection of dated records rather than inline
 * items — a fixture this unit test has no business building — so the case is gone
 * rather than faked.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import {
  CONTENT_WIDTH_KEY,
  CONTENT_MAX_WIDTH,
  CONTENT_DEFAULT_WIDTH,
  CONTENT_WIDTH_STEP,
} from '@/lib/layout/content-width'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
}))

jest.mock('@/lib/pages/commit', () => jest.requireActual('./helpers/page-commit-mock').pageCommitMock())

const blocks: Block[] = [{ id: 'b-text', type: 'text', content: 'Notes on the workbench build' }]

function renderPanel() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  mockFetchPages.mockResolvedValue([])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const getColumn = () => screen.getByTestId('page-column')
const getHandle = () => screen.getByRole('separator', { name: 'Resize page width' })

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
})

describe('DocumentPanel resizable content column (#58)', () => {
  it('renders the editor column at the default width with the resize handle on it', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    expect(getColumn().style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH}px`)
    expect(getColumn()).toContainElement(getHandle())
  })

  it('the page-column is a flex column at least the canvas height, so the trailing gap can fill it (KAN-498)', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    const classes = getColumn().className.split(' ')
    expect(classes).toEqual(expect.arrayContaining(['flex', 'flex-col', 'min-h-full']))
  })

  it('adopts a persisted width on load — the reload half of "survives reload"', async () => {
    window.localStorage.setItem(CONTENT_WIDTH_KEY, '900')
    renderPanel()
    await screen.findByLabelText('Page title')
    await waitFor(() => expect(getColumn().style.maxWidth).toBe('900px'))
  })

  it('clamps a persisted out-of-band width to the ceiling', async () => {
    window.localStorage.setItem(CONTENT_WIDTH_KEY, '5000')
    renderPanel()
    await screen.findByLabelText('Page title')
    await waitFor(() => expect(getColumn().style.maxWidth).toBe(`${CONTENT_MAX_WIDTH}px`))
  })

  it('a keyboard resize updates the rendered column live AND persists the new width', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    fireEvent.keyDown(getHandle(), { key: 'ArrowRight' })
    const grown = CONTENT_DEFAULT_WIDTH + CONTENT_WIDTH_STEP
    expect(getColumn().style.maxWidth).toBe(`${grown}px`)
    expect(window.localStorage.getItem(CONTENT_WIDTH_KEY)).toBe(String(grown))
  })

  it('a drag updates the column live and persists only on release', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')
    const handle = getHandle()
    const down = new Event('pointerdown', { bubbles: true, cancelable: true })
    Object.assign(down, { pointerId: 1, clientX: 300 })
    fireEvent(handle, down)
    const move = new Event('pointermove', { bubbles: true, cancelable: true })
    Object.assign(move, { pointerId: 1, clientX: 350 })
    fireEvent(handle, move)
    // Live during the drag (100 = 2× the 50px delta), but not yet persisted…
    expect(getColumn().style.maxWidth).toBe(`${CONTENT_DEFAULT_WIDTH + 100}px`)
    expect(window.localStorage.getItem(CONTENT_WIDTH_KEY)).toBeNull()
    // …until the gesture ends.
    const up = new Event('pointerup', { bubbles: true, cancelable: true })
    Object.assign(up, { pointerId: 1, clientX: 350 })
    fireEvent(handle, up)
    expect(window.localStorage.getItem(CONTENT_WIDTH_KEY)).toBe(String(CONTENT_DEFAULT_WIDTH + 100))
  })
})
