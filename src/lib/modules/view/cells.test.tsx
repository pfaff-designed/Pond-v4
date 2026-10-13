import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Cell } from './cells'
import type { PropertyDef } from '@/lib/properties/schema'

const textDef: PropertyDef = { id: 'p-1', name: 'Notes', type: 'text' }

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
