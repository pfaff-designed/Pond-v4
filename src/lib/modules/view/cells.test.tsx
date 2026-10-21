import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Cell } from './cells'
import { formatAtomDate, localToday, parseDateInput } from '@/lib/properties/date-input'
import type { PropertyDef } from '@/lib/properties/schema'

const textDef: PropertyDef = { id: 'p-1', name: 'Notes', type: 'text' }
const numberDef: PropertyDef = { id: 'p-2', name: 'Count', type: 'number' }
const dateDef: PropertyDef = { id: 'p-3', name: 'Due', type: 'date' }
const selectDef: PropertyDef = {
  id: 'p-4',
  name: 'Type',
  type: 'select',
  options: [
    { id: 'o1', label: 'event' },
    { id: 'o2', label: 'appointment' },
  ],
}

describe('Cell — text editor', () => {
  it('fires no onChange while typing, then commits once on blur with the full string', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={textDef} value="" editable onChange={onChange} />)

    await user.click(screen.getByLabelText('Notes value'))
    await user.keyboard('hello')
    expect(onChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('hello')
  })

  it('commits null for an emptied cell', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={textDef} value="kept" editable onChange={onChange} />)

    const input = screen.getByLabelText('Notes value')
    await user.click(input)
    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('Cell — number editor', () => {
  it('fires no onChange while typing, then commits once on blur with the parsed number', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={numberDef} value={null} editable onChange={onChange} />)

    await user.click(screen.getByLabelText('Count value'))
    await user.keyboard('42')
    expect(onChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(42)
  })

  it('commits null for an emptied cell', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={numberDef} value={7} editable onChange={onChange} />)

    const input = screen.getByLabelText('Count value')
    await user.click(input)
    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('Cell — date editor', () => {
  it('renders no native type=date input — click opens the atom editor, typing "tomorrow" commits the resolved day', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = render(<Cell def={dateDef} value={null} editable onChange={onChange} />)

    expect(container.querySelector('input[type="date"]')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    expect(input).not.toHaveAttribute('type', 'date')

    await user.type(input, 'tomorrow')
    const resolved = parseDateInput('tomorrow', localToday()) as string
    expect(screen.getByText(formatAtomDate(resolved))).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(resolved)
  })

  it('shows "not a date" and writes nothing for an unparseable draft', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={dateDef} value="2026-10-20" editable onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.type(input, 'not a day')
    await user.keyboard('{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('not a date')).toBeInTheDocument()
  })

  it('commits null for an emptied cell', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={dateDef} value="2026-10-20" editable onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('Esc mid-edit reverts without committing', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Cell def={dateDef} value="2026-10-20" editable onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Due value' }))
    const input = screen.getByLabelText('Due value')
    await user.clear(input)
    await user.type(input, 'tomorrow')
    await user.keyboard('{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Due value' })).toBeInTheDocument()
  })
})

describe('Cell — select/status (tag) editor', () => {
  it('renders no native <select> — click opens the option menu, picking a row writes its id', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { container } = render(<Cell def={selectDef} value={null} editable onChange={onChange} />)

    expect(container.querySelector('select')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Type value' }))
    expect(screen.getByRole('listbox', { name: 'options' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'appointment' }))
    expect(onChange).toHaveBeenCalledWith('o2')
  })

  it('without onAddOption, an unmatched query shows no "+ new tag" row', async () => {
    const user = userEvent.setup()
    render(<Cell def={selectDef} value={null} editable onChange={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'urgent')
    expect(screen.queryByRole('option', { name: /new tag/ })).not.toBeInTheDocument()
  })

  it('with onAddOption, an unmatched query shows "+ new tag"; picking it raises onAddOption', async () => {
    const user = userEvent.setup()
    const onAddOption = jest.fn()
    render(
      <Cell def={selectDef} value={null} editable onChange={jest.fn()} onAddOption={onAddOption} />
    )

    await user.click(screen.getByRole('button', { name: 'Type value' }))
    await user.type(screen.getByRole('textbox', { name: 'filter options' }), 'urgent')
    await user.click(screen.getByRole('option', { name: /new tag/ }))
    expect(onAddOption).toHaveBeenCalledWith('urgent')
  })
})
