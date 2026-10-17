import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddRowInput } from '@/lib/modules/view/add-row-input'

describe('AddRowInput', () => {
  it('commits once on Enter with non-empty text and, with staysOpen, clears and keeps focus', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(<AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen />)

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('milk{Enter}')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('milk')
    expect(onCancel).not.toHaveBeenCalled()
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('commits once on Enter and, without staysOpen, closes via onCancel', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(
      <AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen={false} />,
    )

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('dentist{Enter}')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('dentist')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('writes nothing on Enter with empty or whitespace-only text', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(<AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen />)

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('{Enter}')
    await user.keyboard('   {Enter}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(input).toHaveFocus()
  })

  it('writes nothing on blur with empty or whitespace-only text, and closes', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(<AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen />)

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('   ')
    await user.tab()

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('reverts and writes nothing on Escape', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(<AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen />)

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('dentist{Escape}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('')
  })

  it('saves on blur with text', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(
      <AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen={false} />,
    )

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('plan')
    await user.tab()

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('plan')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('never double-commits when a native blur follows an Enter commit', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(<AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen />)

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('eggs{Enter}')
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('with staysOpen, a commit via Enter does not swallow a later blur commit of new text', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const onCancel = jest.fn()
    render(<AddRowInput aria-label="add" onCommit={onCommit} onCancel={onCancel} staysOpen />)

    const input = screen.getByLabelText<HTMLInputElement>('add')
    await user.click(input)
    await user.keyboard('milk{Enter}')
    await user.keyboard('eggs')
    await user.tab()

    expect(onCommit).toHaveBeenCalledTimes(2)
    expect(onCommit).toHaveBeenNthCalledWith(1, 'milk')
    expect(onCommit).toHaveBeenNthCalledWith(2, 'eggs')
  })
})
