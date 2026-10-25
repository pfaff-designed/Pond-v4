/**
 * KAN-476 — `ShellCommands`' keydown effect wires ⌘⇧\ to the rail-focus seam
 * (`requestRailRowFocus`), same mocking shape as `kan-476-go-to-parent-path.test.tsx`:
 * pressing the chord dispatches the request; pressing it while the rail is
 * minimized does not.
 */
import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { CommandPath } from '@/lib/pages/command-path'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({ blocks: [] }),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))
jest.mock('@/lib/layout/command-path', () => ({
  useCommandPath: (): CommandPath => ({ glyph: 'ramp', trail: [], current: 'roof', role: null }),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { FOCUS_RAIL_ROW_EVENT } from '@/lib/layout/rail-focus'
import { setRailMinimized } from '@/lib/layout/rail-chrome'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

const pressRailFocus = (target: Document | Element = document) =>
  fireEvent.keyDown(target, { key: '|', code: 'Backslash', metaKey: true, shiftKey: true })

beforeEach(() => {
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => {
  setRailMinimized(false)
  jest.restoreAllMocks()
})

describe('KAN-476 — ⌘⇧\\ asks the rail to focus the open row', () => {
  it('dispatches the focus-rail-row request', () => {
    renderShell()
    const listener = jest.fn()
    window.addEventListener(FOCUS_RAIL_ROW_EVENT, listener)

    pressRailFocus()

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(FOCUS_RAIL_ROW_EVENT, listener)
  })

  it('fires from inside an editable field too — no isEditableField guard', () => {
    renderShell()
    const input = document.createElement('input')
    document.body.appendChild(input)
    const listener = jest.fn()
    window.addEventListener(FOCUS_RAIL_ROW_EVENT, listener)

    pressRailFocus(input)

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(FOCUS_RAIL_ROW_EVENT, listener)
    document.body.removeChild(input)
  })

  it('does nothing while the rail is minimized', () => {
    setRailMinimized(true)
    renderShell()
    const listener = jest.fn()
    window.addEventListener(FOCUS_RAIL_ROW_EVENT, listener)

    pressRailFocus()

    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(FOCUS_RAIL_ROW_EVENT, listener)
  })
})
