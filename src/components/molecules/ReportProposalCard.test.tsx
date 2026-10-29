/**
 * KAN-572 — the composer's report card files only when the person presses
 * file it, with their edits; cancel files nothing; filed shows the key.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { ReportProposalCard, type ReportProposalStatus } from './ReportProposalCard'

function setup(status: ReportProposalStatus = 'proposed', extra = {}) {
  const onFile = jest.fn()
  const onCancel = jest.fn()
  const utils = render(
    <ReportProposalCard
      summary="calendar opens on the wrong month"
      text="it opened on june"
      status={status}
      onFile={onFile}
      onCancel={onCancel}
      {...extra}
    />
  )
  return { onFile, onCancel, ...utils }
}

describe('ReportProposalCard', () => {
  it('shows the drafted summary and text, editable, and files nothing until pressed', () => {
    const { onFile } = setup()
    expect(screen.getByLabelText('summary')).toHaveValue('calendar opens on the wrong month')
    expect(screen.getByLabelText('described')).toHaveValue('it opened on june')
    expect(onFile).not.toHaveBeenCalled()
  })

  it('file it files the edited draft', () => {
    const { onFile } = setup()
    fireEvent.change(screen.getByLabelText('summary'), {
      target: { value: 'calendar opens on june' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'file it' }))
    expect(onFile).toHaveBeenCalledWith({
      summary: 'calendar opens on june',
      text: 'it opened on june',
    })
  })

  it('cancel files nothing', () => {
    const { onFile, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onFile).not.toHaveBeenCalled()
  })

  it('while filing, file it is inert, so a second press files nothing more', () => {
    const { onFile } = setup('filing')
    const button = screen.getByRole('button', { name: 'file it' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onFile).not.toHaveBeenCalled()
  })

  it('filed shows the ticket key as a link and no controls', () => {
    setup('filed', { filedKey: 'KAN-900', filedUrl: 'https://x/browse/KAN-900' })
    expect(screen.getByRole('link', { name: 'KAN-900' })).toHaveAttribute(
      'href',
      'https://x/browse/KAN-900'
    )
    expect(screen.queryByRole('button', { name: 'file it' })).toBeNull()
  })

  it('cancelled renders nothing', () => {
    const { container } = setup('cancelled')
    expect(container).toBeEmptyDOMElement()
  })

  it('a failed filing shows why and keeps file it live for a retry', () => {
    setup('proposed', { error: "can't file reports right now" })
    expect(screen.getByRole('alert')).toHaveTextContent("can't file reports right now")
    expect(screen.getByRole('button', { name: 'file it' })).toBeEnabled()
  })
})
