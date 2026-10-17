/**
 * KAN-407's path test, PATH_STEPS 1–6, walked on the real surface: the title
 * row eyebrow (`DocumentPanel.tsx`, fed by `titleEyebrow()` from
 * `usePageDraft`) is where saving, offline, retry, `beforeunload` and the
 * close-within-the-pause flush all read. `BlockCanvas`/tiptap typing isn't
 * needed here — the title input alone drives `usePageDraft`'s debounced save.
 */

import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))

const mockGetPage = jest.fn()
const mockUpdateTitle = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: (...args: unknown[]) => mockUpdateTitle(...args),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
}))

function renderPanel(title: string, blocks: Array<Record<string, unknown>>) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title, blocks, props: {} })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 17, 14, 2))
  jest.clearAllMocks()
  mockUpdateTitle.mockResolvedValue(undefined)
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
  jest.useRealTimers()
})

describe('KAN-407 — a save that fails says so, and nothing typed is lost on close (PATH_STEPS 1–6)', () => {
  it('walks typing, offline, retry, beforeunload and the close-within-the-pause flush on the real DocumentPanel', async () => {
    const { unmount } = renderPanel('', [{ id: 'b1', type: 'text', content: '' }])
    const title = await screen.findByLabelText('Page title')

    // STEP 1: type → saving… → saved hh:mm.
    fireEvent.change(title, { target: { value: 'Kitchen renovation' } })
    expect(await screen.findByText('saving…')).toBeInTheDocument()
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByText('saved 14:02')).toBeInTheDocument()

    // STEP 2: offline → eyebrow reads offline; typing stays local (no network).
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(await screen.findByText('offline — kept on this device')).toBeInTheDocument()
    const callsBeforeOffline = mockUpdateTitle.mock.calls.length
    fireEvent.change(title, { target: { value: 'Kitchen renovation plan' } })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
    })
    expect(screen.getByText('offline — kept on this device')).toBeInTheDocument()
    expect(mockUpdateTitle.mock.calls.length).toBe(callsBeforeOffline)

    // STEP 3: online → the pending draft flushes at once → saved hh:mm.
    await act(async () => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByText('saved 14:02')).toBeInTheDocument()
    expect(mockUpdateTitle).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      'Kitchen renovation plan'
    )

    // STEP 4: a save that throws while online → not saved — retrying → the
    // retry lands → saved hh:mm.
    mockUpdateTitle.mockRejectedValueOnce(new Error('500'))
    fireEvent.change(title, { target: { value: 'Kitchen renovation plan v2' } })
    await act(async () => {
      jest.advanceTimersByTime(EDIT_PAUSE_MS)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByText('not saved — retrying')).toBeInTheDocument()
    await act(async () => {
      jest.advanceTimersByTime(2000) // the first backoff step
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(await screen.findByText('saved 14:02')).toBeInTheDocument()

    // STEP 5: while unsaved, beforeunload is cancelable.
    fireEvent.change(title, { target: { value: 'Kitchen renovation plan v3' } })
    expect(await screen.findByText('saving…')).toBeInTheDocument()
    const beforeUnload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    act(() => {
      window.dispatchEvent(beforeUnload)
    })
    expect(beforeUnload.defaultPrevented).toBe(true)

    // STEP 6: close within the 600ms pause → pagehide flushes immediately
    // (the debounce timer never fires) → the last phrase is there on reopen.
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockUpdateTitle).toHaveBeenLastCalledWith(
      expect.anything(),
      'page-1',
      'Kitchen renovation plan v3'
    )
    expect(await screen.findByText('saved 14:02')).toBeInTheDocument()

    unmount()
    const reopened = renderPanel('Kitchen renovation plan v3', [{ id: 'b1', type: 'text', content: '' }])
    expect(await reopened.findByLabelText('Page title')).toHaveValue('Kitchen renovation plan v3')
  })
})
