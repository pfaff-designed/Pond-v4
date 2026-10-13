import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DraftInput } from './draft-input'

function Host({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return <DraftInput aria-label="draft" value={value} onCommit={onCommit} />
}

describe('DraftInput', () => {
  it('fires no onCommit while typing, then commits once on blur with the full string', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Host value="" onCommit={onCommit} />)

    await user.click(screen.getByLabelText('draft'))
    await user.keyboard('hello')
    expect(onCommit).not.toHaveBeenCalled()

    await user.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('hello')
  })

  it('commits once and blurs on Enter', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Host value="" onCommit={onCommit} />)

    await user.click(screen.getByLabelText('draft'))
    await user.keyboard('hi{Enter}')

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('hi')
    expect(screen.getByLabelText('draft')).not.toHaveFocus()
  })

  it('reverts to the pre-edit value on Escape and fires no onCommit', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Host value="kept" onCommit={onCommit} />)

    const input = screen.getByLabelText<HTMLInputElement>('draft')
    await user.click(input)
    await user.keyboard(' extra{Escape}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(input).toHaveValue('kept')
    expect(input).not.toHaveFocus()
  })

  it('does not reset the draft when value changes while focused (KAN-299)', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const { rerender } = render(<Host value="" onCommit={onCommit} />)

    const input = screen.getByLabelText<HTMLInputElement>('draft')
    await user.click(input)
    await user.keyboard('ty')
    rerender(<Host value="a write landed mid-typing" onCommit={onCommit} />)
    await user.keyboard('ping')

    expect(input).toHaveValue('typing')

    await user.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('typing')
  })

  it('fires no onCommit on a later blur with no typing after an Escape (KAN-299)', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Host value="kept" onCommit={onCommit} />)

    const input = screen.getByLabelText<HTMLInputElement>('draft')
    await user.click(input)
    await user.keyboard(' extra{Escape}')
    expect(onCommit).not.toHaveBeenCalled()

    await user.click(input)
    await user.tab()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not blur or commit on an Enter that confirms an IME composition', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Host value="" onCommit={onCommit} />)

    const input = screen.getByLabelText<HTMLInputElement>('draft')
    await user.click(input)
    await user.keyboard('hi')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(onCommit).not.toHaveBeenCalled()
    expect(input).toHaveFocus()
  })

  it('fires no onCommit on blur when the draft is unchanged from value', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    render(<Host value="same" onCommit={onCommit} />)

    await user.click(screen.getByLabelText('draft'))
    await user.tab()

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits the draft once on unmount without a blur (KAN-299)', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const { unmount } = render(<Host value="" onCommit={onCommit} />)

    await user.click(screen.getByLabelText('draft'))
    await user.keyboard('typed')
    unmount()

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('typed')
  })

  it('does not double-commit on unmount after a blur already committed', async () => {
    const user = userEvent.setup()
    const onCommit = jest.fn()
    const { unmount } = render(<Host value="" onCommit={onCommit} />)

    await user.click(screen.getByLabelText('draft'))
    await user.keyboard('typed')
    await user.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)

    unmount()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
