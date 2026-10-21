/**
 * The path test for KAN-501: `NewPondFlow` is the real host wiring `NewPondSheet`
 * to `useCreatePond`/`createPond`, not the sheet alone.
 */

import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = jest.fn()
const addPond = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/lib/pond/context', () => ({ usePond: () => ({ addPond }) }))
jest.mock('@/lib/pond/client', () => ({ createPond: jest.fn() }))

import { createPond } from '@/lib/pond/client'
import { NewPondFlow } from './NewPondFlow'

const create = createPond as jest.Mock
const STUDIO = { id: 'p-studio', name: 'Studio', glyph: 'waves-02', theme: 'ink', order: 1 }

/** The real switcher host: `NewPondFlow` only exists while the sheet is open,
 *  so `onClose` actually unmounts it — the sheet's own hold-release never runs
 *  if the test keeps rendering it after the sheet calls `onClose`. */
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
  push.mockClear()
  addPond.mockClear()
  create.mockReset()
  document.documentElement.classList.remove('dark')
})

describe('NewPondFlow — the picked glyph and theme reach createPond (KAN-501)', () => {
  it('type a name, pick a glyph, pick ink, make pond: createPond gets the glyph and theme', async () => {
    create.mockResolvedValueOnce(STUDIO)
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Host onClose={onClose} />)

    await user.type(screen.getByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getAllByRole('radio')[1])
    await user.click(screen.getByRole('button', { name: 'ink' }))
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    expect(create).toHaveBeenCalledWith('Studio', { glyph: 'waves-02', theme: 'ink' })
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('picking ink then pressing Esc on step 1 reverts the preview and creates nothing', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<Host onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'ink' }))
    expect(document.documentElement).toHaveClass('dark')

    await user.keyboard('{Escape}')

    expect(document.documentElement).not.toHaveClass('dark')
    expect(create).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledWith(false)
  })
})
