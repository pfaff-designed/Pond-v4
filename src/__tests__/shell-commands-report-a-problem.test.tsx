/**
 * KAN-335: ⌘K's `report a problem` row mounts `ReportProblemBox` over the shell
 * (same `naming`/`NewPondFlow` shape) and esc closes it. `onSubmit` posts to
 * `/api/feedback` (mocked here) and drives `status` through `sending` to
 * `filed`/`error`.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

import { ShellCommands } from '@/components/organisms/ShellCommands'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShellCommands />
    </QueryClientProvider>
  )

describe('ShellCommands — `report a problem` opens the box', () => {
  beforeEach(() => {
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('⌘K, type rep, ↵ — the box is in the DOM with the current page title chip; esc removes it', async () => {
    const user = userEvent.setup()
    renderShell()

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: 'rep' } })
    // The matched substring ("rep") sits in its own span, so the row's
    // computed accessible name breaks mid-word — read `textContent` instead.
    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options.some((o) => o.textContent?.includes('report a problem'))).toBe(true)
    })

    fireEvent.keyDown(input, { key: 'Enter' })

    const box = await screen.findByRole('dialog', { name: 'report a problem' })
    expect(box).toHaveTextContent('life')

    await user.click(screen.getByRole('textbox', { name: 'what went wrong?' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'report a problem' })).toBeNull()
  })

  const openReportBox = async (user: ReturnType<typeof userEvent.setup>) => {
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: 'rep' } })
    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options.some((o) => o.textContent?.includes('report a problem'))).toBe(true)
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByRole('dialog', { name: 'report a problem' })
    const line = screen.getByRole('textbox', { name: 'what went wrong?' })
    await user.type(line, 'the page is blank')
    await user.keyboard('{Enter}')
  }

  it('a filed response renders `filed as KAN-900 · thanks` with a link', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'KAN-900', url: 'https://pfaff-team.atlassian.net/browse/KAN-900' }),
    }) as jest.Mock
    const user = userEvent.setup()
    renderShell()

    await openReportBox(user)

    const box = await screen.findByRole('dialog', { name: 'report a problem' })
    await waitFor(() => expect(box).toHaveTextContent('filed as KAN-900 · thanks'))
    const link = screen.getByRole('link', { name: 'KAN-900' })
    expect(link).toHaveAttribute('href', 'https://pfaff-team.atlassian.net/browse/KAN-900')
  })

  it('a non-ok response renders the "can\'t file reports right now" copy', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as jest.Mock
    const user = userEvent.setup()
    renderShell()

    await openReportBox(user)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("can't file reports right now")
    )
  })

  it('a rejected fetch renders the same error copy', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as jest.Mock
    const user = userEvent.setup()
    renderShell()

    await openReportBox(user)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("can't file reports right now")
    )
  })
})
