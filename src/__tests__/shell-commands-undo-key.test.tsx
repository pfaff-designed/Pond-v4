/**
 * ⌘Z/⇧⌘Z (KAN-93): one shell-level listener, beside ⌘K's and ⌘J's, mounted in
 * `ShellCommands`. An editable field — Tiptap's own undo, an input, a select —
 * keeps the key; everywhere else it reaches `sessionUndo`. ⌘Y alone is Chrome/
 * Safari's History on a Mac (K1–K4), so redo stays ⇧⌘Z there; off a Mac, Ctrl+Y
 * is the redo convention and is handled too.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: jest.fn().mockResolvedValue({ outcome: 'empty' }),
    redo: jest.fn().mockResolvedValue({ outcome: 'empty' }),
  },
}))
jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { requestComposerNotice } from '@/lib/terminal-focus'
import { changeLogKey } from '@/lib/change-log/keys'
import { pagesKey } from '@/lib/pages/keys'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShellCommands />
      <input aria-label="a text field" />
    </QueryClientProvider>
  )

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

beforeEach(() => jest.clearAllMocks())
afterEach(() => jest.restoreAllMocks())

describe('ShellCommands — ⌘Z undoes, ⇧⌘Z redoes, in the active pond', () => {
  it('⌘Z calls sessionUndo.undo with the active pond, and prevents the default', () => {
    onPlatform('MacIntel')
    renderShell()
    const prevented = fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1')
    expect(sessionUndo.redo).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('⇧⌘Z calls sessionUndo.redo with the active pond', () => {
    onPlatform('MacIntel')
    renderShell()
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })

    expect(sessionUndo.redo).toHaveBeenCalledWith('pond-1')
    expect(sessionUndo.undo).not.toHaveBeenCalled()
  })

  it('is Ctrl off a Mac', () => {
    onPlatform('Win32')
    renderShell()
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true })

    expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1')
    expect(sessionUndo.redo).toHaveBeenCalledWith('pond-1')
  })
})

describe('ShellCommands — ⌘Y redo is a Mac exception (K1–K4)', () => {
  it('does nothing on a Mac — ⌘Y stays the browser’s History', () => {
    onPlatform('MacIntel')
    renderShell()
    const prevented = fireEvent.keyDown(document.body, { key: 'y', metaKey: true })

    expect(sessionUndo.redo).not.toHaveBeenCalled()
    expect(prevented).toBe(true)
  })

  it('redoes off a Mac — Ctrl+Y is the convention there', () => {
    onPlatform('Win32')
    renderShell()
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true })

    expect(sessionUndo.redo).toHaveBeenCalledWith('pond-1')
  })
})

describe('ShellCommands — an editable keeps its own ⌘Z', () => {
  it('leaves the key alone while an input has focus', () => {
    onPlatform('MacIntel')
    renderShell()
    const field = screen.getByLabelText('a text field')
    field.focus()

    const prevented = fireEvent.keyDown(field, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).not.toHaveBeenCalled()
    expect(prevented).toBe(true)
  })

  it('leaves the key alone when the event target is a contenteditable, even if focus has moved on', () => {
    onPlatform('MacIntel')
    const { container } = renderShell()
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    container.appendChild(editable)

    const prevented = fireEvent.keyDown(editable, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).not.toHaveBeenCalled()
    expect(prevented).toBe(true)
  })
})

describe('ShellCommands — an empty page-title input has nothing of its own to undo', () => {
  it('⌘Z runs the session undo when the marked title input is focused and empty', () => {
    onPlatform('MacIntel')
    const { container } = renderShell()
    const title = document.createElement('input')
    title.setAttribute('data-pond-page-title', '')
    title.value = ''
    container.appendChild(title)
    title.focus()

    const prevented = fireEvent.keyDown(title, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1')
    expect(prevented).toBe(false)
  })

  it('leaves the key alone when the marked title input is focused and has text', () => {
    onPlatform('MacIntel')
    const { container } = renderShell()
    const title = document.createElement('input')
    title.setAttribute('data-pond-page-title', '')
    title.value = 'recipe name'
    container.appendChild(title)
    title.focus()

    const prevented = fireEvent.keyDown(title, { key: 'z', metaKey: true })

    expect(sessionUndo.undo).not.toHaveBeenCalled()
    expect(prevented).toBe(true)
  })
})

describe('ShellCommands — a landed step redraws the page, rail and change log', () => {
  const renderWithClient = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateQueries = jest.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <ShellCommands />
      </QueryClientProvider>
    )
    return invalidateQueries
  }

  it('on done, invalidates the page tree, the change log and each touched page', async () => {
    onPlatform('MacIntel')
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-1' }, { targetPageId: 'page-2' }, { targetPageId: null }],
    } as never)
    const invalidateQueries = renderWithClient()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: pagesKey() }))
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: changeLogKey() })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'page-1'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'page-2'] })
    expect(requestComposerNotice).toHaveBeenCalledWith('')
  })

  it('on stale/blocked/refused, shows one notice line and invalidates nothing', async () => {
    onPlatform('MacIntel')
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'stale',
      reason: 'page-changed',
    } as never)
    const invalidateQueries = renderWithClient()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() =>
      expect(requestComposerNotice).toHaveBeenCalledWith(
        "can't undo — the page changed since. revert it from the change log."
      )
    )
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('on a thrown (network) error, shows one notice line in the chord’s own direction', async () => {
    onPlatform('MacIntel')
    jest.mocked(sessionUndo.redo).mockRejectedValueOnce(new Error('offline'))
    renderWithClient()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })

    await waitFor(() =>
      expect(requestComposerNotice).toHaveBeenCalledWith("can't redo — try again.")
    )
  })

  it('on empty, clears any notice and invalidates nothing', async () => {
    onPlatform('MacIntel')
    const invalidateQueries = renderWithClient()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(requestComposerNotice).toHaveBeenCalledWith(''))

    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('a stale notice does not survive a later done — the line is cleared, not left reading backwards', async () => {
    onPlatform('MacIntel')
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'stale',
      reason: 'page-changed',
    } as never)
    renderWithClient()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() =>
      expect(requestComposerNotice).toHaveBeenCalledWith(
        "can't undo — the page changed since. revert it from the change log."
      )
    )

    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({ outcome: 'done', records: [] } as never)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() => expect(requestComposerNotice).toHaveBeenLastCalledWith(''))
  })
})
