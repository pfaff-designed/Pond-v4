/**
 * `ConfirmDialog`'s `requiredText` confirmation (KAN-493): the confirm button
 * stays disabled until the typed value exactly matches, and Esc/cancel close
 * with no `onConfirm` call either way.
 */

import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog, type ConfirmDialogProps } from '@/components/molecules/ConfirmDialog'

type HarnessProps = Omit<ConfirmDialogProps, 'open' | 'onOpenChange'>

const Harness = (props: HarnessProps) => {
  const [open, setOpen] = useState(true)
  return <ConfirmDialog {...props} open={open} onOpenChange={setOpen} />
}

describe('ConfirmDialog requiredText', () => {
  it('disables confirm at open', () => {
    render(<Harness title="Delete this?" requiredText="Studio" onConfirm={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('stays disabled on a partial or case-mismatched type', async () => {
    const user = userEvent.setup()
    render(<Harness title="Delete this?" requiredText="Studio" onConfirm={jest.fn()} />)
    const field = screen.getByRole('textbox')

    await user.type(field, 'Stud')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()

    await user.clear(field)
    await user.type(field, 'studio')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('enables on an exact match', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    render(<Harness title="Delete this?" requiredText="Studio" onConfirm={onConfirm} />)
    const field = screen.getByRole('textbox')

    await user.type(field, 'Studio')
    const confirm = screen.getByRole('button', { name: 'Delete' })
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('closes on Esc with no onConfirm call', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    render(<Harness title="Delete this?" requiredText="Studio" onConfirm={onConfirm} />)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes on Cancel with no onConfirm call', async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    render(<Harness title="Delete this?" requiredText="Studio" onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
