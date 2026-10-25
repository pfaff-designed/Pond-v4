/**
 * `PondSettingsPage` (KAN-493): the ponds list and its `delete…` dialog
 * wiring, mocked at `@/lib/pond/client` the same way `pond-switcher.test.tsx`
 * does (migration 0036 may not be applied yet; the component's behaviour
 * must not wait on that). The full person's-path walk (rail → settings →
 * delete → switcher → deleted → restore) is `settings-pond-delete-path.test.tsx`;
 * this file only proves the dialog wiring this component owns.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondSettingsPage } from '@/components/organisms/PondSettingsPage'
import { PondProvider } from '@/lib/pond/context'

const push = jest.fn()
let mockSearch = ''

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  softDeletePond: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))

const requestNotify = jest.fn()
jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: (...args: unknown[]) => requestNotify(...args),
}))

import { listPonds, softDeletePond, setPondLastPage } from '@/lib/pond/client'

const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const STUDIO = { id: 'p-studio', name: 'Studio', glyph: 'star-01', theme: 'paper', order: 1 }

function renderPage() {
  return render(
    <PondProvider>
      <PondSettingsPage />
    </PondProvider>
  )
}

function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByTestId('settings-pond-row')
    .find((r) => r.textContent?.includes(name))
  if (!row) throw new Error(`no settings row for "${name}"`)
  return row
}

beforeEach(() => {
  mockSearch = ''
  push.mockClear()
  requestNotify.mockClear()
  ;(listPonds as jest.Mock).mockResolvedValue([LIFE, STUDIO])
  ;(softDeletePond as jest.Mock).mockReset().mockResolvedValue(undefined)
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
})

describe('PondSettingsPage', () => {
  it('lists every live pond with a delete… control', async () => {
    renderPage()
    await screen.findByText('Studio')
    expect(screen.getByText('life')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'delete…' })).toHaveLength(2)
  })

  it('opens the typed-name dialog and keeps confirm disabled until it matches', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Studio')

    await user.click(within(rowFor('Studio')).getByRole('button', { name: 'delete…' }))

    const confirm = screen.getByRole('button', { name: 'Delete' })
    expect(confirm).toBeDisabled()

    const field = screen.getByRole('textbox')
    await user.type(field, 'studio')
    expect(confirm).toBeDisabled()

    await user.clear(field)
    await user.type(field, 'Studio')
    expect(confirm).toBeEnabled()
  })

  it('confirming calls softDeletePond and drops the row from the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Studio')

    await user.click(within(rowFor('Studio')).getByRole('button', { name: 'delete…' }))
    await user.type(screen.getByRole('textbox'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(softDeletePond).toHaveBeenCalledWith('p-studio'))
    await waitFor(() => expect(screen.queryByText('Studio')).not.toBeInTheDocument())
    expect(push).not.toHaveBeenCalled()
  })

  it('Esc closes the dialog with no softDeletePond call and the row stays', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Studio')

    await user.click(within(rowFor('Studio')).getByRole('button', { name: 'delete…' }))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(softDeletePond).not.toHaveBeenCalled()
    expect(screen.getByText('Studio')).toBeInTheDocument()
  })

  it('deleting the active pond navigates to the first remaining live pond', async () => {
    const user = userEvent.setup()
    mockSearch = 'pond=p-life'
    renderPage()
    await screen.findByText('Studio')

    await user.click(within(rowFor('life')).getByRole('button', { name: 'delete…' }))
    await user.type(screen.getByRole('textbox'), 'life')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(expect.stringContaining('pond=p-studio'))
    )
  })
})
