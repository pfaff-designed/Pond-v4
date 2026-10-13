/**
 * KAN-195 — the cover's `?ask=` carries typed text into the root's composer.
 * `DocumentPanel` reads it once on mount, fires the same focus signal the
 * palette uses, and strips the param so a reload never replays it.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestTerminalFocus } from '@/lib/terminal-focus'

let mockSearchParams = new URLSearchParams()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}))

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))
jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', title: 'Life', blocks: [], props: {} }),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/pages/home', () => ({
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'page-1', title: 'Life' }),
}))
jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestTerminalFocus: jest.fn(),
}))

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSearchParams = new URLSearchParams()
})

describe('DocumentPanel — the carried `?ask=`', () => {
  it('focuses the terminal with the carried text and strips `ask` from the URL', async () => {
    mockSearchParams = new URLSearchParams('ask=plan+a+garden')
    renderPanel()
    await screen.findByLabelText('Page title')

    expect(requestTerminalFocus).toHaveBeenCalledWith('plan a garden')
    expect(mockReplace).toHaveBeenCalledWith('/workspace')
  })

  it('does nothing when there is no `ask` param', async () => {
    renderPanel()
    await screen.findByLabelText('Page title')

    expect(requestTerminalFocus).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('leaves other params in place when stripping `ask`', async () => {
    mockSearchParams = new URLSearchParams('ask=hi&foo=bar')
    renderPanel()
    await screen.findByLabelText('Page title')

    expect(mockReplace).toHaveBeenCalledWith('/workspace?foo=bar')
  })
})
