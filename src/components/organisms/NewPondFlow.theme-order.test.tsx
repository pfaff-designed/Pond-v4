/**
 * KAN-501's ordering hazard: on `make pond`, the sheet's theme hold releases
 * (unmount) and the context's mid-session theme switch (`setMode`, on the new
 * `?pond=` resolving) can land in either order. The ground must settle the
 * same way regardless. `NewPondFlow.test.tsx` mocks `usePond` away, so it
 * cannot see this — this hosts the REAL `PondProvider` instead, with only
 * `@/lib/pond/client` mocked (`pond-switcher.test.tsx`'s own pattern).
 */

import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PondProvider } from '@/lib/pond/context'
import { NewPondFlow } from './NewPondFlow'

let mockSearch = 'pond=p-life'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (url: string) => {
      mockSearch = url.split('?')[1] ?? ''
    },
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  createPond: jest.fn(),
  setPondLastPage: jest.fn(),
}))

import { createPond, listPonds, setPondLastPage } from '@/lib/pond/client'

// STUDIO starts in the list already (not added by `addPond`): this test is
// about the hold/switch race, not about `createPond`/`addPond` wiring, which
// `NewPondFlow.test.tsx` and `pond-switcher.test.tsx` already cover.
const LIFE = { id: 'p-life', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const STUDIO = { id: 'p-studio', name: 'Studio', glyph: 'lightning-03', theme: 'ink', order: 1 }

const html = document.documentElement
const isDark = () => html.classList.contains('dark')

/** The real switcher host: `NewPondFlow` only exists while the sheet is open. */
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

function tree(onClose: (created: boolean) => void) {
  return (
    <PondProvider>
      <Host onClose={onClose} />
    </PondProvider>
  )
}

beforeEach(() => {
  mockSearch = 'pond=p-life'
  html.classList.remove('dark')
  ;(listPonds as jest.Mock).mockReset().mockResolvedValue([LIFE, STUDIO])
  ;(createPond as jest.Mock).mockReset().mockResolvedValue(STUDIO)
  ;(setPondLastPage as jest.Mock).mockReset().mockResolvedValue(undefined)
})

describe('NewPondFlow in the real PondProvider — the ground settles the same way either order (KAN-501)', () => {
  it('order (a): the sheet unmounts (releases) before the pond switch is observed', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    const { rerender } = render(tree(onClose))

    await user.type(await screen.findByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'ink' }))
    expect(isDark()).toBe(true)

    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    // The sheet is gone (its hold released) before anything re-reads `?pond=`:
    // the ground is back to life's own, pre-sheet paper.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onClose).toHaveBeenCalledWith(true)
    expect(isDark()).toBe(false)

    // The navigation lands: the context re-renders against the new `?pond=`.
    rerender(tree(onClose))
    await waitFor(() => expect(isDark()).toBe(true))
  })

  it('order (b): the pond switch applies while the sheet’s hold is still live, then the sheet unmounts', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    const { rerender } = render(tree(onClose))

    await user.type(await screen.findByPlaceholderText('Name your pond'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'ink' }))
    expect(isDark()).toBe(true)

    // The switch lands WHILE the sheet's own ink hold is still forcing the ground.
    mockSearch = 'pond=p-studio'
    rerender(tree(onClose))
    await waitFor(() => expect(isDark()).toBe(true))

    await user.click(screen.getByRole('button', { name: 'continue' }))
    await user.click(screen.getByRole('button', { name: 'make pond' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onClose).toHaveBeenCalledWith(true)
    // Without the fix, the hold's release restores the stale pre-switch ground
    // (light); with it, the release lands on the switched-to pond's own ground.
    expect(isDark()).toBe(true)
  })
})
