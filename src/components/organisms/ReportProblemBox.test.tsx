import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportProblemBox, type ReportProblemBoxProps } from '@/components/organisms/ReportProblemBox'

const baseProps: ReportProblemBoxProps = {
  pageTitle: 'kitchen renovation',
  status: 'idle',
  onSubmit: jest.fn(),
  onClose: jest.fn(),
}

describe('ReportProblemBox — the line and send (KAN-335)', () => {
  it('focuses the line on mount, so typing straight after ⌘K → ↵ needs no click', () => {
    render(<ReportProblemBox {...baseProps} />)

    expect(screen.getByRole('textbox', { name: 'what went wrong?' })).toHaveFocus()
  })

  it('disables send while the line is empty, and enables it once there is text — no click first', async () => {
    const user = userEvent.setup()
    render(<ReportProblemBox {...baseProps} />)

    const send = screen.getByRole('button', { name: 'send' })
    expect(send).toBeDisabled()

    await user.keyboard('the chip is wrong')
    expect(send).toBeEnabled()
  })

  it('closes on Escape with no prior click', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<ReportProblemBox {...baseProps} onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submits once on Enter, and a doubled Enter while sending still files once', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    const { rerender } = render(<ReportProblemBox {...baseProps} onSubmit={onSubmit} />)

    await user.keyboard('the chip is wrong{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('the chip is wrong')

    rerender(<ReportProblemBox {...baseProps} onSubmit={onSubmit} status="sending" />)
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit on empty Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    render(<ReportProblemBox {...baseProps} onSubmit={onSubmit} />)

    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('re-focuses the line once status returns to idle after a send', () => {
    const { rerender } = render(<ReportProblemBox {...baseProps} status="sending" />)
    expect(screen.getByRole('textbox', { name: 'what went wrong?' })).not.toHaveFocus()

    rerender(<ReportProblemBox {...baseProps} status="idle" />)
    expect(screen.getByRole('textbox', { name: 'what went wrong?' })).toHaveFocus()
  })

  it('renders the filed copy with a link to the issue', () => {
    render(
      <ReportProblemBox
        {...baseProps}
        status="filed"
        filedKey="KAN-123"
        filedUrl="https://pfaff-team.atlassian.net/browse/KAN-123"
      />
    )

    expect(screen.getByText(/filed as/)).toHaveTextContent('filed as KAN-123 · thanks')
    expect(screen.getByRole('link', { name: 'KAN-123' })).toHaveAttribute(
      'href',
      'https://pfaff-team.atlassian.net/browse/KAN-123'
    )
  })

  it('focuses the dialog (not the link) once filed, so a second ↵ cannot open the issue', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)

    render(
      <ReportProblemBox
        {...baseProps}
        onSubmit={onSubmit}
        status="filed"
        filedKey="KAN-123"
        filedUrl="https://pfaff-team.atlassian.net/browse/KAN-123"
      />
    )

    expect(screen.getByRole('dialog', { name: 'report a problem' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'KAN-123' })).not.toHaveFocus()

    await user.keyboard('{Enter}')

    expect(openSpy).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('renders the error text verbatim', () => {
    render(
      <ReportProblemBox {...baseProps} status="error" errorText="can't file reports right now" />
    )

    expect(screen.getByRole('alert')).toHaveTextContent("can't file reports right now")
  })
})
