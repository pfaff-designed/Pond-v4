import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewKindPicker, type ViewKindPickerRow } from '@/components/molecules/ViewKindPicker'

const ANCHOR = { getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 0 }) }

const ROWS: ViewKindPickerRow[] = [
  { mode: 'table' },
  { mode: 'calendar', remedyLine: 'add a date field to use calendar' },
  { mode: 'board' },
]

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
    render(<ViewKindPicker rows={ROWS} anchor={ANCHOR} onPick={onPick} onClose={jest.fn()} />)

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onPick).toHaveBeenCalledWith('board')
  })

  it('closes on Escape without picking', async () => {
    const user = userEvent.setup()
    const onPick = jest.fn()
    const onClose = jest.fn()
    render(<ViewKindPicker rows={ROWS} anchor={ANCHOR} onPick={onPick} onClose={onClose} />)

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

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
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
