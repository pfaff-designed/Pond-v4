import { useEffect, useRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewKindPicker, type ViewKindPickerRow } from '@/components/molecules/ViewKindPicker'
import type { ViewMode } from '@/lib/modules/view/schema'

const ANCHOR = { getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 0 }) }

const ROWS: ViewKindPickerRow[] = [
  { mode: 'table' },
  { mode: 'calendar', remedyLine: 'add a date field to use calendar' },
  { mode: 'board' },
]

/**
 * The keydown listener only acts on keys whose target is the "＋ view"
 * anchor or the glass itself — in `ViewBar`, focus stays on the anchor
 * button for as long as the picker is open (nothing in the glass is
 * focusable). A real, focused anchor element stands in for that here;
 * `ANCHOR`'s plain rect object (used where only positioning matters)
 * isn't a `Node`, so it can never satisfy that check.
 */
function KeyboardHarness({
  rows = ROWS,
  onPick,
  onClose,
}: {
  rows?: ViewKindPickerRow[]
  onPick: (mode: ViewMode) => void
  onClose: () => void
}) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    anchorRef.current?.focus()
  }, [])
  return (
    <div>
      <button ref={anchorRef} type="button">
        add a view
      </button>
      <ViewKindPicker rows={rows} anchor={anchorRef} onPick={onPick} onClose={onClose} />
    </div>
  )
}

describe('ViewKindPicker — the ＋ view picker', () => {
  it('renders one row per mode, in order, with a remedy row\'s hint', () => {
    render(<ViewKindPicker rows={ROWS} anchor={ANCHOR} onPick={jest.fn()} onClose={jest.fn()} />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('table')
    expect(options[1]).toHaveTextContent('calendar')
    expect(options[1]).toHaveTextContent('add a date field to use calendar')
    expect(options[2]).toHaveTextContent('board')
  })

  it('picks the third row on ↓↓↵', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    render(<KeyboardHarness onPick={onPick} onClose={jest.fn()} />)

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onPick).toHaveBeenCalledWith('board')
  })

  it('closes on Escape without picking', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    const onClose = jest.fn()
    render(<KeyboardHarness onPick={onPick} onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('draws a disabled row faint and never picks it, by click or ↵', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    const rows: ViewKindPickerRow[] = [
      ...ROWS,
      { mode: 'gantt', disabled: 'this database has no collection to add a date field to' },
    ]
    render(<ViewKindPicker rows={rows} anchor={ANCHOR} onPick={onPick} onClose={jest.fn()} />)

    const disabledRow = screen.getByRole('option', { name: /timeline/ })
    expect(disabledRow).toHaveTextContent('this database has no collection to add a date field to')
    expect(disabledRow.className).toContain('text-mn-text-meta')

    await user.click(disabledRow)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('never picks a disabled row by ↵, either', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    const rows: ViewKindPickerRow[] = [
      ...ROWS,
      { mode: 'gantt', disabled: 'this database has no collection to add a date field to' },
    ]
    render(<KeyboardHarness rows={rows} onPick={onPick} onClose={jest.fn()} />)

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('Tab closes the picker and does not pick — a ↵ after it reaches whatever Tab focused next, not this picker', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    const onClose = jest.fn()
    render(<KeyboardHarness onPick={onPick} onClose={onClose} />)

    await user.keyboard('{Tab}')
    expect(onClose).toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(onPick).not.toHaveBeenCalled()
  })

  it('closes on a pointerdown outside the glass', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(
      <div>
        <button type="button">elsewhere</button>
        <ViewKindPicker rows={ROWS} anchor={ANCHOR} onPick={jest.fn()} onClose={onClose} />
      </div>
    )

    await user.click(screen.getByText('elsewhere'))

    expect(onClose).toHaveBeenCalled()
  })
})
