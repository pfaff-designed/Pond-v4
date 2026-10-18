/**
 * The pond theme applies at creation only (KAN-501 scope cut; applying it on
 * switch moved to KAN-503) — `NewPondFlow` is the only place `setMode` is
 * called outside `mode.ts` itself. Proves the creation path through
 * `NewPondFlow` directly (mocked context/client, `NewPondFlow.test.tsx`'s own
 * pattern), not through the context: that effect no longer exists.
 */

import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addPond = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/lib/pond/context', () => ({ usePond: () => ({ addPond }) }))
jest.mock('@/lib/pond/client', () => ({ createPond: jest.fn() }))

import { createPond } from '@/lib/pond/client'
import { NewPondFlow } from './NewPondFlow'

const create = createPond as jest.Mock
const STUDIO = { id: 'p-studio', name: 'Studio', glyph: 'lightning-03', theme: 'ink', order: 1 }

const html = document.documentElement
const isDark = () => html.classList.contains('dark')

/** The real switcher host: `NewPondFlow` only exists while the sheet is open,
 *  so `onClose` actually unmounts it and runs the sheet's own hold-release. */
function Host({ onClose }: { onClose: (created: boolean) => void }) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <NewPondFlow
      onClose={(created) => {
        setOpen(false)
        onClose(created)
      }}
    />
  )
}

beforeEach(() => {
  addPond.mockClear()
  create.mockReset()
  html.classList.remove('dark')
})

describe('NewPondFlow applies the picked theme once, at creation (KAN-501)', () => {
  it('order (a): create resolves immediately — dark settles once the sheet unmounts', async () => {
    create.mockResolvedValueOnce(STUDIO)
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Host onClose={onClose} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'ink' }))
    expect(isDark()).toBe(true)

    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
    expect(isDark()).toBe(true)
  })

  it('order (b): create resolves after the sheet has had a tick to run its own effects — dark still settles', async () => {
    let resolveCreate: (pond: typeof STUDIO) => void = () => {}
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Host onClose={onClose} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'ink' }))
    expect(isDark()).toBe(true)

    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    // The sheet's own ink hold is still live (create hasn't resolved yet) —
    // `setMode` must still land on dark once it does, and the eventual
    // unmount's release must not fight it.
    expect(isDark()).toBe(true)
    resolveCreate(STUDIO)

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
    expect(isDark()).toBe(true)
  })

  it('make pond without touching a pill while already dark leaves dark unchanged', async () => {
    create.mockResolvedValueOnce({ ...STUDIO, theme: 'paper' })
    html.classList.add('dark')
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Host onClose={onClose} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
    expect(create).toHaveBeenCalledWith('Studio', { glyph: 'lightning-03' })
    expect(isDark()).toBe(true)
  })
})
