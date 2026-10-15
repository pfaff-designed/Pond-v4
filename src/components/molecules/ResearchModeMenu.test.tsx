/**
 * `ResearchModeMenu` — the composer's mode menu (6r f1): rows `ask` and
 * `deep research`, copy verbatim, picking the mode for the next question.
 */

import { useRef, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResearchModeMenu, type ResearchModeMenuAction } from '@/components/molecules/ResearchModeMenu'

interface HarnessProps {
  selected?: ResearchModeMenuAction
  onSelect?: (action: ResearchModeMenuAction) => void
  onOpenChange?: (open: boolean) => void
}

const Harness = ({ selected = 'ask', onSelect = jest.fn(), onOpenChange = jest.fn() }: HarnessProps) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef}>
      <ResearchModeMenu
        selected={selected}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange(next)
        }}
        onSelect={onSelect}
        trigger={<button type="button">research</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
      />
    </div>
  )
}

const trigger = () => screen.getByRole('button', { name: 'research' })
const menu = () => screen.getByRole('menu', { name: 'mode menu' })
const items = () => within(menu()).getAllByRole('menuitem')

const openWithKeyboard = async (user: ReturnType<typeof userEvent.setup>) => {
  trigger().focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('menu', { name: 'mode menu' })
  await waitFor(() => expect(items()[0]).toHaveFocus())
}

describe('ResearchModeMenu', () => {
  it('lists "ask" and "deep research" with their descriptions, copy verbatim', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)

    expect(items().map((item) => item.textContent)).toEqual([
      'askreads this pond. quick.',
      'deep researchreads the web and this pond. slow and thorough: primary sources, every claim checked against independent ones.',
    ])
  })

  it('selecting a row fires onSelect with that row’s action', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    await openWithKeyboard(user)

    await user.click(screen.getByText('deep research'))

    expect(onSelect).toHaveBeenCalledWith('deep-research')
  })

  it('Esc closes with onOpenChange(false) and picks nothing', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    const onOpenChange = jest.fn()
    render(<Harness onSelect={onSelect} onOpenChange={onOpenChange} />)
    await openWithKeyboard(user)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
