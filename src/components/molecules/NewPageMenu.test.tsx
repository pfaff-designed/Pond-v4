/**
 * `NewPageMenu` — the board's new-page menu (6s f1): its header names the
 * parent, its two rows are "page" and "from a template", and a double ↵
 * makes one pick, not two (G9).
 */

import { useRef, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewPageMenu, type NewPageMenuAction } from '@/components/molecules/NewPageMenu'

interface HarnessProps {
  parentTitle?: string
  onSelect?: (action: NewPageMenuAction) => void
  onOpenChange?: (open: boolean) => void
}

const Harness = ({
  parentTitle = 'kitchen renovation',
  onSelect = jest.fn(),
  onOpenChange = jest.fn(),
}: HarnessProps) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchorRef}>
      <NewPageMenu
        parentTitle={parentTitle}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange(next)
        }}
        onSelect={onSelect}
        trigger={<button type="button">new page</button>}
        placement={{ anchor: anchorRef, align: 'start', top: 40, alignOffset: -8 }}
      />
    </div>
  )
}

const trigger = () => screen.getByRole('button', { name: 'new page' })
const menu = () => screen.getByRole('menu', { name: 'new page menu' })
const items = () => within(menu()).getAllByRole('menuitem')

/** Opened from the keyboard, like the block kind's own tests — the first item takes focus. */
const openWithKeyboard = async (user: ReturnType<typeof userEvent.setup>) => {
  trigger().focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('menu', { name: 'new page menu' })
  await waitFor(() => expect(items()[0]).toHaveFocus())
}

describe('NewPageMenu', () => {
  it('heads with the parent and lists "page" then "from a template", copy verbatim', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)

    expect(within(menu()).getByText('new page in kitchen renovation')).toBeInTheDocument()
    expect(items().map((item) => item.textContent)).toEqual([
      'pageblocks, text, databases',
      'from a templatetwelve to start from',
    ])
  })

  it('↓ and ↑ move the highlight between the two rows', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openWithKeyboard(user)

    await user.keyboard('{ArrowDown}')
    expect(items()[1]).toHaveFocus()
    expect(items()[1]).toHaveAttribute('data-highlighted')

    await user.keyboard('{ArrowUp}')
    expect(items()[0]).toHaveFocus()
    expect(items()[0]).toHaveAttribute('data-highlighted')
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

  it('↵ fires onSelect once — a held/double ↵ does not pick twice (G9)', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    await openWithKeyboard(user)

    await user.keyboard('{Enter}{Enter}')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('page')
  })
})
