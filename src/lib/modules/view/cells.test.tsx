import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Cell } from './cells'
import type { PropertyDef } from '@/lib/properties/schema'

const textDef: PropertyDef = { id: 'p-1', name: 'Notes', type: 'text' }
const numberDef: PropertyDef = { id: 'p-2', name: 'Count', type: 'number' }
const dateDef: PropertyDef = { id: 'p-3', name: 'Due', type: 'date' }

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
  it('fires no onChange for the partial-year intermediates while typing, only the final value on blur', () => {
    const onChange = jest.fn()
    render(<Cell def={dateDef} value={null} editable onChange={onChange} />)

    const input = screen.getByLabelText('Due value')
    // A native date input's onChange fires per keystroke with every intermediate
    // partial year — this is the bug report's "0002-10-20" reproduced directly.
    fireEvent.change(input, { target: { value: '0002-10-20' } })
    fireEvent.change(input, { target: { value: '0020-10-20' } })
    fireEvent.change(input, { target: { value: '2026-10-20' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-10-20')
  })

  it('still commits a value set in one whole change, as the native date picker fires', () => {
    const onChange = jest.fn()
    render(<Cell def={dateDef} value={null} editable onChange={onChange} />)

    const input = screen.getByLabelText('Due value')
    fireEvent.change(input, { target: { value: '2026-10-20' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-10-20')
  })

  it('commits null for an emptied cell', () => {
    const onChange = jest.fn()
    render(<Cell def={dateDef} value="2026-10-20" editable onChange={onChange} />)

    const input = screen.getByLabelText('Due value')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
